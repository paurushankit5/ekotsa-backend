import { Op } from "sequelize";
import { AppError } from "../../middleware/errorHandler.js";
import { loadEnv } from "../../config/env.js";
import {
  User,
  PasswordResetOtp,
  GoogleOAuthTransaction,
  LicenseGrant,
} from "../../db/models/index.js";
import {
  generateOtp,
  hashOtp,
  hashPassword,
  normalizeEmail,
  publicUser,
  safeEqual,
  signResetToken,
  signSession,
  verifyPassword,
  verifyResetToken,
} from "./auth.crypto.js";
import { sendOtpEmail } from "./auth.mailer.js";
import { getGraceDays, getTrialDays } from "../../services/license-artifacts.js";
import {
  completeGoogleOAuthCallback,
  hashGoogleOAuthValue,
  normalizeBrowserReturnTo,
  normalizeDesktopCallbackUri,
  startGoogleOAuth,
  type StartGoogleOAuthResult,
} from "./auth.google.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export const AuthService = {
  async signup(input: { email: string; password: string; name?: string }) {
    const email = normalizeEmail(input.email);
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      throw new AppError(409, "Email already registered", "EMAIL_TAKEN");
    }

    const user = await User.create({
      email,
      passwordHash: await hashPassword(input.password),
      name: input.name?.trim() || null,
      emailVerified: true,
      role: "USER",
    });

    const token = await signSession({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // Best-effort link to an existing customer registration
    const { RegistrationsService } = await import("../registrations/registrations.service.js");
    await RegistrationsService.linkUser(user.id, user.email).catch(() => undefined);

    return { user: publicUser(user), token };
  },

  async login(input: { email: string; password: string }) {
    const email = normalizeEmail(input.email);
    const user = await User.findOne({ where: { email } });
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new AppError(401, "Invalid credentials", "INVALID_CREDENTIALS");
    }

    const token = await signSession({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const { RegistrationsService } = await import("../registrations/registrations.service.js");
    await RegistrationsService.linkUser(user.id, user.email).catch(() => undefined);

    return { user: publicUser(user), token };
  },

  async me(userId: string) {
    const user = await User.findByPk(userId);
    if (!user) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");

    const now = new Date();
    const env = loadEnv();
    const trialDays = getTrialDays(env);
    const graceDays = getGraceDays(env);

    const grant = await LicenseGrant.findOne({
      where: { userId: user.id },
      order: [["expiresAt", "DESC"]],
    });

    const trialStartedAt = user.trialStartedAt;
    const trialEndsAt = trialStartedAt
      ? new Date(trialStartedAt.getTime() + trialDays * 24 * 60 * 60 * 1000)
      : null;

    const grantActive =
      !!grant &&
      grant.status === "ACTIVE" &&
      !grant.revokedAt &&
      !grant.suspendedAt &&
      grant.expiresAt.getTime() > now.getTime();
    const grantGrace =
      !!grant &&
      grant.status === "ACTIVE" &&
      !grant.revokedAt &&
      !grant.suspendedAt &&
      !grantActive &&
      grant.expiresAt.getTime() + graceDays * 24 * 60 * 60 * 1000 > now.getTime();

    const trialActive =
      !!trialEndsAt && trialEndsAt.getTime() > now.getTime() && !grantActive;

    let status = "NOT_ACTIVATED";
    let accessMode: "FULL" | "LIMITED" | "BLOCKED" = "BLOCKED";
    if (grant?.revokedAt || grant?.status === "REVOKED") {
      status = "REVOKED";
      accessMode = "BLOCKED";
    } else if (grant?.suspendedAt || grant?.status === "SUSPENDED") {
      status = "SUSPENDED";
      accessMode = "BLOCKED";
    } else if (grantActive) {
      status = "PAID_ACTIVE";
      accessMode = "FULL";
    } else if (grantGrace) {
      status = "GRACE";
      accessMode = "FULL";
    } else if (trialActive) {
      status = "TRIAL_ACTIVE";
      accessMode = "FULL";
    } else if (trialStartedAt) {
      status = "EXPIRED";
      accessMode = "LIMITED";
    }

    const subscriptionEndsAt = grant?.expiresAt.toISOString() ?? null;

    return {
      user: { email: user.email, role: user.role },
      trial: {
        active: trialActive,
        startsAt: trialStartedAt?.toISOString() ?? null,
        endsAt: trialEndsAt?.toISOString() ?? null,
      },
      subscription: {
        active: grantActive || grantGrace,
        plan: grant?.plan ?? null,
        expiresAt: subscriptionEndsAt,
      },
      entitlement: {
        status,
        accessMode,
        reasonCode: status === "NOT_ACTIVATED" ? "DEVICE_ACTIVATION_REQUIRED" : null,
        trialStartedAt: trialStartedAt?.toISOString() ?? null,
        trialEndsAt: trialEndsAt?.toISOString() ?? null,
        subscriptionEndsAt,
      },
    };
  },

  async forgotPassword(emailRaw: string) {
    const email = normalizeEmail(emailRaw);
    const user = await User.findOne({ where: { email } });

    // Always look successful to avoid email enumeration.
    if (!user) {
      return { sent: true };
    }

    const otp = generateOtp();
    await PasswordResetOtp.update(
      { consumedAt: new Date() },
      {
        where: {
          userId: user.id,
          consumedAt: null,
        },
      },
    );

    await PasswordResetOtp.create({
      userId: user.id,
      otpHash: hashOtp(otp, user.id),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    await sendOtpEmail(user.email, otp, "PASSWORD_RESET");
    return { sent: true };
  },

  /** Login / device-activation OTP — reuses PasswordResetOtp rows for now. */
  async startOtp(input: {
    email: string;
    purpose?: "LOGIN" | "DEVICE_ACTIVATION";
  }): Promise<{ sent: true }> {
    const purpose = input.purpose ?? "LOGIN";
    const email = normalizeEmail(input.email);
    const user = await User.findOne({ where: { email } });

    // Always look successful to avoid email enumeration.
    if (!user) {
      return { sent: true };
    }

    const otp = generateOtp();
    await PasswordResetOtp.update(
      { consumedAt: new Date() },
      {
        where: {
          userId: user.id,
          consumedAt: null,
        },
      },
    );

    await PasswordResetOtp.create({
      userId: user.id,
      otpHash: hashOtp(otp, user.id),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    await sendOtpEmail(user.email, otp, purpose);
    return { sent: true };
  },

  async verifyLoginOtp(input: {
    email: string;
    otp: string;
    purpose?: "LOGIN" | "DEVICE_ACTIVATION";
  }): Promise<
    | {
        purpose: "LOGIN";
        user: ReturnType<typeof publicUser>;
        token: string;
      }
    | {
        purpose: "DEVICE_ACTIVATION";
        user: ReturnType<typeof publicUser>;
        activationSession: { token: string; expiresAt: string; expiresAtUnix: number };
      }
  > {
    const purpose = input.purpose ?? "LOGIN";
    const email = normalizeEmail(input.email);
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }

    const record = await PasswordResetOtp.findOne({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      order: [["createdAt", "DESC"]],
    });

    if (!record) {
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }

    if (record.attemptCount >= MAX_OTP_ATTEMPTS) {
      throw new AppError(429, "Too many OTP attempts", "OTP_LOCKED");
    }

    const ok = safeEqual(hashOtp(input.otp, user.id), record.otpHash);
    await record.update({ attemptCount: record.attemptCount + 1 });

    if (!ok) {
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }

    await record.update({ consumedAt: new Date() });

    if (purpose === "DEVICE_ACTIVATION") {
      const { DeviceService } = await import("../devices/devices.service.js");
      const session = await DeviceService.createActivationSession({ userId: user.id });
      return {
        purpose,
        user: publicUser(user),
        activationSession: {
          token: session.token,
          expiresAt: session.expiresAtIso,
          expiresAtUnix: session.expiresAt,
        },
      };
    }

    const token = await signSession({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const { RegistrationsService } = await import("../registrations/registrations.service.js");
    await RegistrationsService.linkUser(user.id, user.email).catch(() => undefined);

    return { purpose: "LOGIN", user: publicUser(user), token };
  },

  async verifyOtp(input: { email: string; otp: string }) {
    const email = normalizeEmail(input.email);
    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }

    const record = await PasswordResetOtp.findOne({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
      order: [["createdAt", "DESC"]],
    });

    if (!record) {
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }

    if (record.attemptCount >= MAX_OTP_ATTEMPTS) {
      throw new AppError(429, "Too many OTP attempts", "OTP_LOCKED");
    }

    const ok = safeEqual(hashOtp(input.otp, user.id), record.otpHash);
    await record.update({ attemptCount: record.attemptCount + 1 });

    if (!ok) {
      throw new AppError(400, "Invalid or expired OTP", "OTP_INVALID");
    }

    const resetToken = await signResetToken(user.id, user.email);
    return { verified: true, resetToken };
  },

  async resetPassword(input: {
    newPassword: string;
    resetToken?: string;
    email?: string;
    otp?: string;
  }) {
    let userId: string;

    if (input.resetToken) {
      const claims = await verifyResetToken(input.resetToken);
      if (!claims) {
        throw new AppError(400, "Invalid or expired reset token", "RESET_TOKEN_INVALID");
      }
      userId = claims.userId;
    } else if (input.email && input.otp) {
      const verified = await this.verifyOtp({ email: input.email, otp: input.otp });
      const claims = await verifyResetToken(verified.resetToken);
      if (!claims) {
        throw new AppError(400, "Invalid or expired reset token", "RESET_TOKEN_INVALID");
      }
      userId = claims.userId;
    } else {
      throw new AppError(400, "Provide resetToken, or email + otp", "VALIDATION_ERROR");
    }

    const user = await User.findByPk(userId);
    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");

    await user.update({ passwordHash: await hashPassword(input.newPassword) });
    await PasswordResetOtp.update(
      { consumedAt: new Date() },
      { where: { userId: user.id, consumedAt: null } },
    );

    return { reset: true };
  },

  async startGoogleOAuth(input: {
    emailHint?: string | null;
    desktopCallbackUri?: string | null;
    browserReturnTo?: string | null;
    origin?: string | null;
  }): Promise<StartGoogleOAuthResult> {
    return startGoogleOAuth(input);
  },

  async completeGoogleOAuth(input: {
    code: string;
    state: string;
    origin?: string | null;
  }): Promise<{
    user: ReturnType<typeof publicUser>;
    token: string;
    activationToken: string;
    redirectUrl: string;
  }> {
    const { profile, transaction } = await completeGoogleOAuthCallback(input);
    if (!profile.emailVerified) {
      throw new AppError(400, "Google email is not verified", "GOOGLE_EMAIL_UNVERIFIED");
    }

    let user =
      (await User.findOne({ where: { googleSub: profile.googleSub } })) ||
      (await User.findOne({ where: { email: profile.email } }));

    if (!user) {
      user = await User.create({
        email: profile.email,
        name: profile.name,
        googleSub: profile.googleSub,
        passwordHash: null,
        emailVerified: true,
        role: "USER",
      });
    } else {
      await user.update({
        googleSub: user.googleSub || profile.googleSub,
        emailVerified: true,
        name: user.name || profile.name,
      });
    }

    const { RegistrationsService } = await import("../registrations/registrations.service.js");
    await RegistrationsService.linkUser(user.id, user.email).catch(() => undefined);

    const { DeviceService } = await import("../devices/devices.service.js");
    const activationSession = await DeviceService.createActivationSession({
      userId: user.id,
    });

    await transaction.update({
      userId: user.id,
      completedAt: new Date(),
      exchangeCodeHash: hashGoogleOAuthValue(activationSession.token),
    });

    const token = await signSession({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const env = loadEnv();
    const desktopCallbackUri = normalizeDesktopCallbackUri(transaction.desktopCallbackUri);
    const browserReturnTo = normalizeBrowserReturnTo(
      transaction.browserReturnTo,
      input.origin,
    );

    let redirectUrl: string;
    if (desktopCallbackUri) {
      const url = new URL(desktopCallbackUri);
      url.searchParams.set("handoff_code", activationSession.token);
      url.searchParams.set("handoffCode", activationSession.token);
      url.searchParams.set("provider", "google");
      redirectUrl = url.toString();
    } else if (browserReturnTo) {
      const url = new URL(browserReturnTo);
      url.searchParams.set("oauth", "google");
      redirectUrl = url.toString();
    } else {
      // Default to dashboard after web Google login (not the login page).
      const url = new URL("/dashboard", env.FRONTEND_URL);
      url.searchParams.set("oauth", "google");
      redirectUrl = url.toString();
    }

    return {
      user: publicUser(user),
      token,
      activationToken: activationSession.token,
      redirectUrl,
    };
  },

  /** @deprecated Prefer completeGoogleOAuth */
  async loginWithGoogle(input: {
    code: string;
    state: string;
    origin?: string | null;
  }): Promise<{ user: ReturnType<typeof publicUser>; token: string }> {
    const result = await this.completeGoogleOAuth(input);
    return { user: result.user, token: result.token };
  },

  async exchangeGoogleHandoff(input: { handoffCode: string }): Promise<{
    ok: true;
    user: ReturnType<typeof publicUser>;
    activationSession: {
      token: string;
      expiresAt: number;
      expiresAtIso: string;
    };
  }> {
    const exchangeHash = hashGoogleOAuthValue(input.handoffCode);
    const transaction = await GoogleOAuthTransaction.findOne({
      where: {
        provider: "GOOGLE",
        exchangeCodeHash: exchangeHash,
      },
    });

    if (!transaction) {
      throw new AppError(400, "Invalid handoff code.", "GOOGLE_HANDOFF_INVALID");
    }
    if (!transaction.completedAt) {
      throw new AppError(400, "OAuth callback not completed.", "GOOGLE_HANDOFF_INCOMPLETE");
    }
    if (transaction.consumedAt) {
      throw new AppError(409, "Handoff code already used.", "GOOGLE_HANDOFF_CONSUMED");
    }
    if (transaction.expiresAt.getTime() < Date.now()) {
      throw new AppError(400, "OAuth request expired.", "GOOGLE_HANDOFF_EXPIRED");
    }
    if (!transaction.userId) {
      throw new AppError(400, "Invalid handoff code.", "GOOGLE_HANDOFF_INVALID");
    }

    const user = await User.findByPk(transaction.userId);
    if (!user) {
      throw new AppError(404, "User not found.", "USER_NOT_FOUND");
    }

    const { hashActivationSessionToken } = await import("../devices/devices.crypto.js");
    const { ActivationSession } = await import("../../db/models/index.js");
    const activationHash = hashActivationSessionToken(input.handoffCode);

    let activationSession = await ActivationSession.findOne({
      where: {
        sessionTokenHash: activationHash,
        userId: user.id,
        consumedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!activationSession) {
      activationSession = await ActivationSession.findOne({
        where: {
          userId: user.id,
          consumedAt: null,
          expiresAt: { [Op.gt]: new Date() },
        },
        order: [["createdAt", "DESC"]],
      });
    }

    if (!activationSession) {
      throw new AppError(400, "Activation session not found.", "ACTIVATION_SESSION_MISSING");
    }

    await transaction.update({ consumedAt: new Date() });

    return {
      ok: true,
      user: publicUser(user),
      activationSession: {
        token: input.handoffCode,
        expiresAt: Math.floor(activationSession.expiresAt.getTime() / 1000),
        expiresAtIso: activationSession.expiresAt.toISOString(),
      },
    };
  },
};
