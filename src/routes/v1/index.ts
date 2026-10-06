import { Router } from "express";
import { healthRouter } from "../../modules/health/health.routes.js";
import { userRouter } from "../../modules/users/user.routes.js";
import { platformRouter } from "../../modules/platform/platform.routes.js";
import { authRouter } from "../../modules/auth/auth.routes.js";
import { AuthController } from "../../modules/auth/auth.controller.js";
import { organizationsRouter } from "../../modules/organizations/organizations.routes.js";
import { registrationsRouter } from "../../modules/registrations/registrations.routes.js";
import { licensesRouter } from "../../modules/licenses/licenses.routes.js";
import { devicesRouter } from "../../modules/devices/devices.routes.js";
import { activationRouter } from "../../modules/devices/activation.routes.js";
import { downloadsRouter } from "../../modules/downloads/downloads.routes.js";
import { releasesRouter } from "../../modules/releases/releases.routes.js";
import { paymentsRouter } from "../../modules/payments/payments.routes.js";
import { PaymentsController } from "../../modules/payments/payments.controller.js";
import { requireUserSession } from "../../middleware/requireUserSession.js";
import { recoveryRouter } from "../../modules/recovery/recovery.routes.js";
import { portalRouter } from "../../modules/portal/portal.routes.js";
import { adminRouter } from "../../modules/admin/admin.routes.js";
import {
  notificationsInternalRouter,
  notificationsRouter,
} from "../../modules/notifications/notifications.routes.js";
import { ContactController } from "../../modules/contact/contact.controller.js";
import { cmsInternalRouter, cmsRouter } from "../../modules/cms/cms.routes.js";
import { DeviceResetController } from "../../modules/admin/admin.ops.controller.js";
import { ActivationCodesController } from "../../modules/licenses/activation-codes.controller.js";

/**
 * Canonical public API. Also mounted at /api/v1 for Atithi / website compatibility.
 */
export const v1Router = Router();

v1Router.use("/health", healthRouter);
v1Router.use("/users", userRouter);

v1Router.use("/platform", platformRouter);
v1Router.use("/auth", authRouter);

// Website-compatible flat auth aliases (ekotsa-website /api/v1/login etc.)
v1Router.post("/signup", AuthController.signup);
v1Router.post("/login", AuthController.login);
v1Router.post("/logout", AuthController.logout);
v1Router.get("/me", AuthController.me);
v1Router.post("/send-otp", AuthController.forgotPassword);
v1Router.post("/forgot-password", AuthController.forgotPassword);
v1Router.post("/verify-otp", AuthController.verifyOtp);
v1Router.post("/reset-password", AuthController.resetPassword);
v1Router.get("/oauth/google/start", AuthController.googleStart);
v1Router.post("/oauth/google/start", AuthController.googleStart);
v1Router.get("/oauth/google/callback", AuthController.googleCallback);
v1Router.post("/oauth/google/exchange", AuthController.googleExchange);

v1Router.use("/activation", activationRouter);
v1Router.use("/organizations", organizationsRouter);
v1Router.use("/registrations", registrationsRouter);
v1Router.use("/licenses", licensesRouter);
v1Router.use("/devices", devicesRouter);
v1Router.post(
  "/devices/reset/request",
  requireUserSession,
  DeviceResetController.request,
);
v1Router.use("/downloads", downloadsRouter);
v1Router.use("/releases", releasesRouter);
v1Router.use("/payments", paymentsRouter);

v1Router.get("/payment-qr", PaymentsController.qr);
v1Router.post("/submit-payment", requireUserSession, PaymentsController.submit);
v1Router.post("/submit-payment/confirm", requireUserSession, PaymentsController.confirm);

v1Router.post("/verify-code", requireUserSession, ActivationCodesController.redeem);

v1Router.use("/recovery", recoveryRouter);
v1Router.use("/portal", portalRouter);
v1Router.use("/admin", adminRouter);
v1Router.use("/notifications", notificationsRouter);
v1Router.use("/internal/notifications", notificationsInternalRouter);
v1Router.use("/internal/cms", cmsInternalRouter);

v1Router.post("/contact", ContactController.contact);
v1Router.post("/business-assessment", ContactController.businessAssessment);

v1Router.use("/cms", cmsRouter);
