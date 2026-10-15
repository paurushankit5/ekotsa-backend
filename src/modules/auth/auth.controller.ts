import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { loadEnv } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";
import { AuthService } from "./auth.service.js";
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
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
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
      const result = await AuthService.signup(body);
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
      // Cookie mirror for first navigation; FE /auth/callback stores Bearer JWT.
      // Token MUST be in the query string (not hash): Next.js rewrites strip URL
      // fragments from upstream Location headers, which broke Google login.
      setSessionCookie(res, result.token, result.user.role);
      const target = new URL(result.redirectUrl);
      const callback = new URL("/auth/callback", `${target.protocol}//${target.host}`);
      callback.searchParams.set("redirect", `${target.pathname}${target.search}`);
      callback.searchParams.set("access_token", result.token);
      res.redirect(callback.toString());
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
};
