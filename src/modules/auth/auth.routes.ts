import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { requireAdminSession } from "../../middleware/requireUserSession.js";

/**
 * Simple auth API
 * POST   /v1/auth/signup
 * POST   /v1/auth/login
 * POST   /v1/auth/logout
 * GET    /v1/auth/me
 * POST   /v1/auth/forgot-password   — email OTP
 * POST   /v1/auth/verify-otp        — verify OTP → resetToken
 * POST   /v1/auth/reset-password    — set new password
 * POST   /v1/auth/otp/start         — login / device-activation OTP
 * POST   /v1/auth/otp/verify        — verify → Bearer JWT (LOGIN) or activation session
 * GET+POST /v1/auth/google/start
 * GET    /v1/auth/google/callback
 * POST   /v1/auth/google/exchange
 */
export const authRouter = Router();

authRouter.post("/signup", rateLimit({ keyPrefix: "auth-signup", windowMs: 60_000, max: 10 }), AuthController.signup);
authRouter.post("/login", rateLimit({ keyPrefix: "auth-login", windowMs: 60_000, max: 20 }), AuthController.login);
authRouter.post("/logout", AuthController.logout);
authRouter.get("/me", AuthController.me);
// Public session-verification keys (ES256). Verifiers cache this; contains no secrets.
authRouter.get("/jwks", AuthController.jwks);
authRouter.post("/forgot-password", rateLimit({ keyPrefix: "auth-forgot", windowMs: 60_000, max: 5 }), AuthController.forgotPassword);
authRouter.post("/verify-otp", rateLimit({ keyPrefix: "auth-reset-otp", windowMs: 60_000, max: 20 }), AuthController.verifyOtp);
authRouter.post("/reset-password", rateLimit({ keyPrefix: "auth-reset", windowMs: 60_000, max: 10 }), AuthController.resetPassword);
// Admin session handoff (public site → admin host) via single-use code; no JWT in URLs.
authRouter.post("/admin-handoff", rateLimit({ keyPrefix: "auth-admin-handoff", windowMs: 60_000, max: 10 }), requireAdminSession, AuthController.createAdminHandoff);
authRouter.post("/admin-handoff/exchange", rateLimit({ keyPrefix: "auth-admin-handoff-exchange", windowMs: 60_000, max: 20 }), AuthController.exchangeAdminHandoff);
authRouter.post("/otp/start", rateLimit({ keyPrefix: "auth-otp-start", windowMs: 60_000, max: 5 }), AuthController.startOtp);
authRouter.post("/otp/verify", rateLimit({ keyPrefix: "auth-otp-verify", windowMs: 60_000, max: 20 }), AuthController.verifyLoginOtp);
authRouter.get("/google/start", rateLimit({ keyPrefix: "auth-google-start", windowMs: 60_000, max: 20 }), AuthController.googleStart);
authRouter.post("/google/start", rateLimit({ keyPrefix: "auth-google-start", windowMs: 60_000, max: 20 }), AuthController.googleStart);
authRouter.get("/google/callback", AuthController.googleCallback);
authRouter.post("/google/exchange", rateLimit({ keyPrefix: "auth-google-exchange", windowMs: 60_000, max: 20 }), AuthController.googleExchange);
authRouter.post("/google/exchange-browser", rateLimit({ keyPrefix: "auth-google-browser-exchange", windowMs: 60_000, max: 20 }), AuthController.googleBrowserExchange);
