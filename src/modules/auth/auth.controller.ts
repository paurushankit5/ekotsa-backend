import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { loadEnv } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";
import { AuthService } from "./auth.service.js";
import { getPublicJwks } from "./auth.session-keys.js";
import { privacyFields, type PrivacyInput } from "../privacy/privacy.schema.js";
import { PrivacyService } from "../privacy/privacy.service.js";
import { assertCurrentNotice } from "../privacy/notices.js";
import {
  authTokenPayload,
  clearSessionCookie,
  extractAccessToken,
  setSessionCookie,
  signSession,
  verifySession,
} from "./auth.crypto.js";
import {
  normalizeBrowserReturnTo,
  normalizeDesktopCallbackUri,
} from "./auth.google.js";

const signupSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  password: Joi.string().min(8).max(200).required(),
  name: Joi.string().trim().min(1).max(120).optional(),
  termsAccepted: Joi.boolean().valid(true).required().messages({
    "any.only": "Please accept the Terms of Use to create an account.",
    "any.required": "Please accept the Terms of Use to create an account.",
  }),
  // Consent to use the account details as described in the notice — separate from the Terms.
  consent: Joi.boolean().valid(true).required().messages({
    "any.only": "Please agree to Ekotsa using your details as described in the notice.",
    "any.required": "Please agree to Ekotsa using your details as described in the notice.",
  }),
  ...privacyFields,
});

const googleCompleteSignupSchema = Joi.object({
  signupCode: Joi.string().trim().min(20).max(200).required(),
  termsAccepted: Joi.boolean().valid(true).required().messages({
    "any.only": "Please accept the Terms of Use to create an account.",
    "any.required": "Please accept the Terms of Use to create an account.",
  }),
  // Consent to use the account details as described in the notice — separate from the Terms.
  consent: Joi.boolean().valid(true).required().messages({
    "any.only": "Please agree to Ekotsa using your details as described in the notice.",
    "any.required": "Please agree to Ekotsa using your details as described in the notice.",
  }),
  ...privacyFields,
});

const loginSchema = Joi.object({
  // Login only looks up an existing account, so skip Joi's public-TLD allowlist.
  // Otherwise reserved domains such as the local demo admin's `@ekotsa.test` can never sign in.
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  password: Joi.string().min(1).max(200).required(),
});

const emailSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
});

const verifyOtpSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  otp: Joi.string().pattern(/^\d{6}$/).required().messages({
    "string.pattern.base": "OTP must be 6 digits",
  }),
});

const startLoginOtpSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  purpose: Joi.string().valid("LOGIN", "DEVICE_ACTIVATION").default("LOGIN"),
});

const verifyLoginOtpSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  otp: Joi.string().pattern(/^\d{6}$/).required().messages({
    "string.pattern.base": "OTP must be 6 digits",
  }),
  purpose: Joi.string().valid("LOGIN", "DEVICE_ACTIVATION").default("LOGIN"),
});

const resetPasswordSchema = Joi.object({
  newPassword: Joi.string().min(8).max(200).required(),
  resetToken: Joi.string().min(10).optional(),
  email: Joi.string().email().optional(),
  otp: Joi.string().pattern(/^\d{6}$/).optional(),
}).or("resetToken", "email").custom((value, helpers) => {
  if (value.resetToken) return value;
  if (value.email && value.otp) return value;
  return helpers.error("any.custom", {
    message: "Provide resetToken, or email + otp",
  });
});

const googleStartSchema = Joi.object({
  emailHint: Joi.string().email().max(320).optional(),
  desktopCallbackUri: Joi.string().min(1).max(2048).optional(),
  browserReturnTo: Joi.string().min(1).max(2048).optional(),
});

const googleExchangeSchema = Joi.object({
  handoffCode: Joi.string().min(20).max(500).required(),
});

const adminHandoffExchangeSchema = Joi.object({
  exchangeCode: Joi.string().min(20).max(500).required(),
});

const googleBrowserExchangeSchema = Joi.object({
  exchangeCode: Joi.string().min(20).max(500).required(),
  flow: Joi.string().valid("BROWSER", "ADMIN_HANDOFF").default("BROWSER"),
});

function requestOrigin(req: Request): string {
  const env = loadEnv();
  // Prefer the browser-facing site. APP_PUBLIC_URL is the API host and must not
  // be used here — it rejects browserReturnTo=/dashboard (wrong origin).
  const forwardedHost = req.headers["x-forwarded-host"];
  if (typeof forwardedHost === "string" && forwardedHost.trim()) {
    const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http");
    return `${proto}://${forwardedHost.trim()}`;
  }
  try {
    return new URL(env.FRONTEND_URL).origin;
  } catch {
    // fall through
  }
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http");
  const host = String(req.get("host") || "localhost");
  return `${proto}://${host}`;
}

function googleStartInput(req: Request): {
  emailHint?: string;
  desktopCallbackUri: string | null;
  browserReturnTo: string | null;
  origin: string;
} {
  const origin = requestOrigin(req);
  const source =
    req.method === "GET"
      ? {
          emailHint: typeof req.query.emailHint === "string" ? req.query.emailHint : undefined,
          desktopCallbackUri:
            typeof req.query.desktopCallbackUri === "string"
              ? req.query.desktopCallbackUri
              : undefined,
          browserReturnTo:
            typeof req.query.browserReturnTo === "string" ? req.query.browserReturnTo : undefined,
        }
      : validateOrThrow(googleStartSchema, req.body ?? {});

  return {
    emailHint: source.emailHint,
    desktopCallbackUri: normalizeDesktopCallbackUri(source.desktopCallbackUri),
    browserReturnTo: normalizeBrowserReturnTo(source.browserReturnTo, origin),
    origin,
  };
}

export const AuthController = {
  async signup(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(signupSchema, req.body);
      assertCurrentNotice("signup", body.noticeVersion);
      const result = await AuthService.signup({ email: body.email, password: body.password, name: body.name });
      const consent = await PrivacyService.recordConsent({
        subjectType: "USER",
        subjectId: result.user.id,
        noticeKey: "signup",
        email: result.user.email,
        childName: body.name ?? null,
        purposes: ["account"],
        privacy: body as unknown as PrivacyInput,
        termsAccepted: body.termsAccepted,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      if (consent.guardianStatus === "PENDING") {
        // Under-18: no session until a parent/guardian approves by email.
        res.status(201).json({ ok: true, requiresGuardianConsent: true, user: { email: result.user.email } });
        return;
      }
      const auth = authTokenPayload(result.token, result.user);
      // Cookie mirror for Next middleware only; clients must use Bearer accessToken.
      setSessionCookie(res, result.token, result.user.role);
      res.status(201).json({ ok: true, ...auth, data: auth });
    } catch (error) {
      next(error);
    }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(loginSchema, req.body);
      const result = await AuthService.login(body);
      const auth = authTokenPayload(result.token, result.user);
      setSessionCookie(res, result.token, result.user.role);
      res.json({ ok: true, ...auth, data: auth });
    } catch (error) {
      next(error);
    }
  },

  async logout(_req: Request, res: Response, next: NextFunction) {
    try {
      clearSessionCookie(res);
      res.json({ ok: true, data: { loggedOut: true } });
    } catch (error) {
      next(error);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const token = extractAccessToken(req);
      if (!token) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const session = await verifySession(token);
      if (!session) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const payload = await AuthService.me(session.userId);
      // Flat shape for website apiGet (`{ ok, user, trial, subscription, entitlement }`).
      res.json({ ok: true, ...payload, data: payload });
    } catch (error) {
      next(error);
    }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(emailSchema, req.body);
      const result = await AuthService.forgotPassword(body.email);
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async startOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(startLoginOtpSchema, req.body);
      const result = await AuthService.startOtp(body);
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async verifyLoginOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(verifyLoginOtpSchema, req.body);
      const result = await AuthService.verifyLoginOtp(body);
      if (result.purpose === "LOGIN") {
        const auth = authTokenPayload(result.token, result.user);
        setSessionCookie(res, result.token, result.user.role);
        res.json({ ok: true, ...auth, data: auth });
        return;
      }
      res.json({
        ok: true,
        data: {
          user: result.user,
          activationSession: result.activationSession,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(verifyOtpSchema, req.body);
      const result = await AuthService.verifyOtp(body);
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(resetPasswordSchema, req.body);
      const result = await AuthService.resetPassword(body);
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async googleStart(req: Request, res: Response, next: NextFunction) {
    try {
      const input = googleStartInput(req);
      const started = await AuthService.startGoogleOAuth(input);

      if (req.method === "GET") {
        res.redirect(started.authorizationUrl);
        return;
      }

      res.json({
        ok: true,
        data: {
          oauth: {
            provider: "google",
            authorizationUrl: started.authorizationUrl,
            expiresAt: started.expiresAt.toISOString(),
            redirectUri: started.redirectUri,
            state: started.state,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async googleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const oauthError =
        typeof req.query.error === "string" ? req.query.error : undefined;
      const oauthErrorDescription =
        typeof req.query.error_description === "string"
          ? req.query.error_description
          : undefined;

      if (oauthError) {
        throw new AppError(
          400,
          oauthErrorDescription || oauthError,
          "GOOGLE_OAUTH_DENIED",
        );
      }
      if (!code || !state) {
        throw new AppError(400, "Missing Google OAuth code/state", "GOOGLE_CALLBACK_INVALID");
      }

      const result = await AuthService.completeGoogleOAuth({
        code,
        state,
        origin: requestOrigin(req),
      });
      const target = new URL(result.redirectUrl);
      // Desktop deep links (hotel-manager://…) go straight back to the app.
      // New Google users finish sign-up (age, guardian, Terms) before any account exists.
      if (target.protocol !== "http:" && target.protocol !== "https:" || target.pathname === "/auth/complete-signup") {
        res.redirect(target.toString());
        return;
      }
      // Browser: the website's /auth/callback reads `exchange_code` as its own parameter,
      // so it must not be buried inside `redirect`.
      const exchangeCode = target.searchParams.get("exchange_code");
      target.searchParams.delete("exchange_code");
      const callback = new URL("/auth/callback", target.origin);
      callback.searchParams.set("redirect", `${target.pathname}${target.search}`);
      if (exchangeCode) callback.searchParams.set("exchange_code", exchangeCode);
      res.redirect(callback.toString());
    } catch (error) {
      next(error);
    }
  },

  async googleSignupProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const code = typeof req.query.signup_code === "string" ? req.query.signup_code : "";
      if (code.length < 20) throw new AppError(400, "Missing sign-up code.", "GOOGLE_SIGNUP_INVALID");
      res.json({ ok: true, profile: await AuthService.getGoogleSignupProfile(code) });
    } catch (error) {
      next(error);
    }
  },

  async googleCompleteSignup(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(googleCompleteSignupSchema, req.body);
      const result = await AuthService.completeGoogleSignup({
        signupCode: body.signupCode,
        privacy: body as unknown as PrivacyInput,
        termsAccepted: body.termsAccepted,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      if (result.requiresGuardianConsent) {
        res.status(201).json({ ok: true, requiresGuardianConsent: true });
        return;
      }
      const auth = authTokenPayload(result.token, result.user);
      setSessionCookie(res, result.token, result.user.role);
      res.status(201).json({ ok: true, ...auth, desktopRedirect: result.desktopRedirect, data: auth });
    } catch (error) {
      next(error);
    }
  },

  async googleExchange(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(googleExchangeSchema, req.body);
      const result = await AuthService.exchangeGoogleHandoff(body);
      const sessionToken = await signSession({
        sub: result.user.id,
        email: result.user.email,
        role: result.user.role,
      });
      const auth = authTokenPayload(sessionToken, result.user);
      setSessionCookie(res, sessionToken, result.user.role);

      // Top-level activationSession for Atithi; `data` kept for web clients.
      res.json({
        ok: true,
        ...auth,
        activationSession: result.activationSession,
        data: {
          ok: true,
          ...auth,
          activationSession: result.activationSession,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /** Public keys for verifying session tokens (JWKS). */
  async jwks(_req: Request, res: Response, next: NextFunction) {
    try {
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(getPublicJwks(loadEnv()));
    } catch (error) {
      next(error);
    }
  },

  /** Signed-in ADMIN (on the public site) asks for a one-time code to carry the session to the admin host. */
  async createAdminHandoff(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await AuthService.createAdminHandoffCode(req.userSession.userId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  /** Admin host redeems the one-time code for an ADMIN session. */
  async exchangeAdminHandoff(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(adminHandoffExchangeSchema, req.body);
      const result = await AuthService.exchangeAdminHandoffCode(body.exchangeCode);
      const auth = authTokenPayload(result.token, result.user);
      setSessionCookie(res, result.token, result.user.role);
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true, ...auth, data: auth });
    } catch (error) {
      next(error);
    }
  },

  async googleBrowserExchange(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(googleBrowserExchangeSchema, req.body);
      const result = await AuthService.exchangeGoogleBrowserCode(body);
      if (result.role === "ADMIN" && "adminExchangeCode" in result) {
        res.json({ ok: true, data: { role: result.role, adminExchangeCode: result.adminExchangeCode } });
        return;
      }
      if (!result.token || !result.user) throw new AppError(400, "Invalid OAuth exchange.", "GOOGLE_EXCHANGE_INVALID");
      const auth = authTokenPayload(result.token, result.user);
      setSessionCookie(res, result.token, result.user.role);
      res.json({ ok: true, ...auth, data: auth });
    } catch (error) {
      next(error);
    }
  },
};
