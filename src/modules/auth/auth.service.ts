import { Op } from "sequelize";
import { randomBytes } from "node:crypto";
import { AppError } from "../../middleware/errorHandler.js";
import { loadEnv } from "../../config/env.js";
import {
  User,
  PasswordResetOtp,
  GoogleOAuthTransaction,
  LicenseGrant,
  AdminHandoffCode,
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
const ADMIN_HANDOFF_TTL_MS = 2 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
export const LOCAL_DEMO_ADMIN_EMAIL = "demo-admin@ekotsa.test";

export function localDemoAdminLoginEnabled(email: string, env: { NODE_ENV: string; LOCAL_DEMO_ADMIN_ENABLED: boolean; DEMO_ADMIN_CONFIRM_DISPOSABLE: boolean }) {
  return env.NODE_ENV !== "production" &&
    env.LOCAL_DEMO_ADMIN_ENABLED &&
    env.DEMO_ADMIN_CONFIRM_DISPOSABLE &&
    normalizeEmail(email) === LOCAL_DEMO_ADMIN_EMAIL;
}

export function passwordLoginMayIssueSession(
  role: "USER" | "ADMIN",
  email?: string,
  env?: { NODE_ENV: string; LOCAL_DEMO_ADMIN_ENABLED: boolean; DEMO_ADMIN_CONFIRM_DISPOSABLE: boolean },
) {
  return role !== "ADMIN" || (!!email && !!env && localDemoAdminLoginEnabled(email, env));
}

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
    if (!passwordLoginMayIssueSession(user.role, user.email, loadEnv())) {
      throw new AppError(403, "Administrator login requires a second factor", "ADMIN_MFA_REQUIRED");
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
      purpose: "PASSWORD_RESET",
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
      purpose,
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
        purpose,
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
        purpose: "PASSWORD_RESET",
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

    const resetToken = await signResetToken(user.id, user.email, record.id);
    await record.update({ consumedAt: new Date() });
    return { verified: true, resetToken };
  },

  async resetPassword(input: {
    newPassword: string;
    resetToken?: string;
    email?: string;
    otp?: string;
  }) {
    let userId: string;
    let resetOtpId: string;

    if (input.resetToken) {
      const claims = await verifyResetToken(input.resetToken);
      if (!claims) {
        throw new AppError(400, "Invalid or expired reset token", "RESET_TOKEN_INVALID");
      }
      userId = claims.userId;
      resetOtpId = claims.otpId;
      const claimed = await PasswordResetOtp.findOne({ where: { id: resetOtpId, userId, purpose: "PASSWORD_RESET", usedAt: null } });
      if (!claimed || claimed.expiresAt.getTime() < Date.now()) {
        throw new AppError(400, "Invalid or expired reset token", "RESET_TOKEN_USED");
      }
      const consumed = await PasswordResetOtp.update(
        { usedAt: new Date() },
        { where: { id: resetOtpId, userId, purpose: "PASSWORD_RESET", usedAt: null } },
      );
      if (consumed[0] !== 1) throw new AppError(400, "Invalid or expired reset token", "RESET_TOKEN_USED");
    } else if (input.email && input.otp) {
      const verified = await this.verifyOtp({ email: input.email, otp: input.otp });
      const claims = await verifyResetToken(verified.resetToken);
      if (!claims) {
        throw new AppError(400, "Invalid or expired reset token", "RESET_TOKEN_INVALID");
      }
      userId = claims.userId;
      resetOtpId = claims.otpId;
    } else {
      throw new AppError(400, "Provide resetToken, or email + otp", "VALIDATION_ERROR");
    }

    const user = await User.findByPk(userId);
    if (!user) throw new AppError(404, "User not found", "USER_NOT_FOUND");

    await user.update({ passwordHash: await hashPassword(input.newPassword) });
    await PasswordResetOtp.update(
      { consumedAt: new Date() },
      { where: { userId: user.id, purpose: "PASSWORD_RESET", consumedAt: null } },
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

    const env = loadEnv();
    const desktopCallbackUri = normalizeDesktopCallbackUri(transaction.desktopCallbackUri);
    const browserExchangeCode = !desktopCallbackUri ? randomBytes(32).toString("base64url") : null;
    await transaction.update({
      userId: user.id,
      completedAt: new Date(),
      exchangeCodeHash: hashGoogleOAuthValue(activationSession.token),
      browserExchangeCodeHash: browserExchangeCode ? hashGoogleOAuthValue(browserExchangeCode) : null,
      browserExchangeExpiresAt: browserExchangeCode ? new Date(Date.now() + 5 * 60 * 1000) : null,
    });

    const token = await signSession({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

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
      url.searchParams.set("exchange_code", browserExchangeCode || "");
      redirectUrl = url.toString();
    } else {
      // Default to dashboard after web Google login (not the login page).
      const url = new URL("/dashboard", env.FRONTEND_URL);
      url.searchParams.set("exchange_code", browserExchangeCode || "");
      redirectUrl = url.toString();
    }

    return {
      user: publicUser(user),
      token,
      activationToken: activationSession.token,
      redirectUrl,
    };
  },

  async exchangeGoogleBrowserCode(input: { exchangeCode: string; flow?: "BROWSER" | "ADMIN_HANDOFF" }): Promise<
    | { role: "ADMIN"; adminExchangeCode: string }
    | { role: "USER" | "ADMIN"; token: string; user: ReturnType<typeof publicUser> }
  > {
    const hash = hashGoogleOAuthValue(input.exchangeCode);
    const flow = input.flow ?? "BROWSER";
    const where = flow === "ADMIN_HANDOFF"
      ? { provider: "GOOGLE", adminExchangeCodeHash: hash }
      : { provider: "GOOGLE", browserExchangeCodeHash: hash };
    const transaction = await GoogleOAuthTransaction.findOne({ where });
    if (!transaction?.userId || !transaction.completedAt) throw new AppError(400, "Invalid OAuth exchange code.", "GOOGLE_EXCHANGE_INVALID");
    const now = new Date();
    if (flow === "ADMIN_HANDOFF") {
      if (transaction.adminExchangeConsumedAt || !transaction.adminExchangeExpiresAt || transaction.adminExchangeExpiresAt < now) throw new AppError(400, "Invalid or expired OAuth exchange code.", "GOOGLE_EXCHANGE_INVALID");
      const updated = await GoogleOAuthTransaction.update({ adminExchangeConsumedAt: now }, { where: { id: transaction.id, adminExchangeConsumedAt: null } });
      if (updated[0] !== 1) throw new AppError(409, "OAuth exchange code already used.", "GOOGLE_EXCHANGE_CONSUMED");
    } else {
      if (transaction.browserExchangeConsumedAt || !transaction.browserExchangeExpiresAt || transaction.browserExchangeExpiresAt < now) throw new AppError(400, "Invalid or expired OAuth exchange code.", "GOOGLE_EXCHANGE_INVALID");
      const updated = await GoogleOAuthTransaction.update({ browserExchangeConsumedAt: now }, { where: { id: transaction.id, browserExchangeConsumedAt: null } });
      if (updated[0] !== 1) throw new AppError(409, "OAuth exchange code already used.", "GOOGLE_EXCHANGE_CONSUMED");
    }
    const user = await User.findByPk(transaction.userId);
    if (!user) throw new AppError(400, "OAuth user no longer exists.", "GOOGLE_EXCHANGE_INVALID");
    if (flow === "BROWSER" && user.role === "ADMIN") {
      const adminCode = randomBytes(32).toString("base64url");
      await transaction.update({ adminExchangeCodeHash: hashGoogleOAuthValue(adminCode), adminExchangeExpiresAt: new Date(Date.now() + 2 * 60 * 1000), adminExchangeConsumedAt: null });
      return { role: user.role, adminExchangeCode: adminCode };
    }
    const token = await signSession({ sub: user.id, email: user.email, role: user.role });
    return { role: user.role, token, user: publicUser(user) };
  },

  /**
   * Issue a single-use, short-lived code that moves an ADMIN session from the public site
   * (where password login happens) to the admin host. Only the code's hash is stored.
   */
  async createAdminHandoffCode(userId: string): Promise<{ exchangeCode: string; expiresAt: string }> {
    const user = await User.findByPk(userId);
    if (!user || user.role !== "ADMIN") throw new AppError(403, "Admin access required", "FORBIDDEN");
    const exchangeCode = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ADMIN_HANDOFF_TTL_MS);
    await AdminHandoffCode.create({
      userId: user.id,
      codeHash: hashGoogleOAuthValue(exchangeCode),
      expiresAt,
      consumedAt: null,
    });
    // Opportunistic cleanup of this user's stale codes.
    await AdminHandoffCode.destroy({ where: { userId: user.id, expiresAt: { [Op.lt]: new Date(Date.now() - 60 * 60 * 1000) } } });
    return { exchangeCode, expiresAt: expiresAt.toISOString() };
  },

  /** Redeem an admin handoff code exactly once and mint the admin-host session. */
  async exchangeAdminHandoffCode(exchangeCode: string): Promise<{ token: string; user: ReturnType<typeof publicUser> }> {
    const now = new Date();
    const record = await AdminHandoffCode.findOne({ where: { codeHash: hashGoogleOAuthValue(exchangeCode) } });
    if (!record || record.consumedAt || record.expiresAt < now) {
      throw new AppError(400, "Invalid or expired sign-in code.", "ADMIN_HANDOFF_INVALID");
    }
    const [updated] = await AdminHandoffCode.update(
      { consumedAt: now },
      { where: { id: record.id, consumedAt: null } },
    );
    if (updated !== 1) throw new AppError(409, "Sign-in code already used.", "ADMIN_HANDOFF_CONSUMED");
    const user = await User.findByPk(record.userId);
    if (!user || user.role !== "ADMIN") throw new AppError(403, "Admin access required", "FORBIDDEN");
    const token = await signSession({ sub: user.id, email: user.email, role: user.role });
    return { token, user: publicUser(user) };
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
