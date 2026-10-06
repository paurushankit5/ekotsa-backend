import { Router } from "express";
import { AuthController } from "./auth.controller.js";

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

authRouter.post("/signup", AuthController.signup);
authRouter.post("/login", AuthController.login);
authRouter.post("/logout", AuthController.logout);
authRouter.get("/me", AuthController.me);
authRouter.post("/forgot-password", AuthController.forgotPassword);
authRouter.post("/verify-otp", AuthController.verifyOtp);
authRouter.post("/reset-password", AuthController.resetPassword);
authRouter.post("/otp/start", AuthController.startOtp);
authRouter.post("/otp/verify", AuthController.verifyLoginOtp);
authRouter.get("/google/start", AuthController.googleStart);
authRouter.post("/google/start", AuthController.googleStart);
authRouter.get("/google/callback", AuthController.googleCallback);
authRouter.post("/google/exchange", AuthController.googleExchange);
