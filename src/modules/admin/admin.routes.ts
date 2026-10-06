import { Router } from "express";
import { requireAdminSession } from "../../middleware/requireUserSession.js";
import { LicenseAdminController } from "../licenses/licenses.admin.controller.js";
import { ActivationCodesController } from "../licenses/activation-codes.controller.js";
import { PaymentsController } from "../payments/payments.controller.js";
import { RecoveryController } from "../recovery/recovery.controller.js";
import { DeviceAdminController } from "../devices/devices.admin.controller.js";
import { AdminOpsController } from "./admin.ops.controller.js";
import { notificationsAdminRouter } from "../notifications/notifications.routes.js";
import { cmsAdminRouter } from "../cms/cms.routes.js";

/**
 * Admin surfaces for Waves B–G
 */
export const adminRouter = Router();

adminRouter.post("/licenses/grants", requireAdminSession, LicenseAdminController.createGrant);
adminRouter.get("/licenses/grants", requireAdminSession, LicenseAdminController.listGrants);
adminRouter.get("/licenses", requireAdminSession, LicenseAdminController.listGrants);
adminRouter.get("/licenses/status", requireAdminSession, LicenseAdminController.userStatus);
adminRouter.post("/licenses/extend", requireAdminSession, LicenseAdminController.extendGrant);
adminRouter.post(
  "/licenses/grants/revoke",
  requireAdminSession,
  LicenseAdminController.revokeGrant,
);
adminRouter.post(
  "/licenses/recovery",
  requireAdminSession,
  RecoveryController.issueDirect,
);

adminRouter.get("/payments", requireAdminSession, PaymentsController.list);
adminRouter.post("/verify-payment", requireAdminSession, PaymentsController.verify);
adminRouter.post("/payments/status", requireAdminSession, PaymentsController.verify);
adminRouter.post("/payments/note", requireAdminSession, PaymentsController.note);

adminRouter.get("/devices", requireAdminSession, DeviceAdminController.list);
adminRouter.post("/devices/revoke", requireAdminSession, DeviceAdminController.revoke);

adminRouter.get("/codes", requireAdminSession, ActivationCodesController.list);
adminRouter.post("/generate-code", requireAdminSession, ActivationCodesController.generate);

adminRouter.get("/recoveries", requireAdminSession, RecoveryController.listArtifacts);
adminRouter.post(
  "/recoveries/revoke",
  requireAdminSession,
  RecoveryController.revokeArtifact,
);

adminRouter.get("/device-resets", requireAdminSession, AdminOpsController.listDeviceResets);
adminRouter.post(
  "/device-resets/decide",
  requireAdminSession,
  AdminOpsController.decideDeviceReset,
);

adminRouter.get("/users", requireAdminSession, AdminOpsController.users);
adminRouter.get("/customers/search", requireAdminSession, AdminOpsController.customersSearch);
adminRouter.get("/active-users", requireAdminSession, AdminOpsController.activeUsers);
adminRouter.get("/metrics", requireAdminSession, AdminOpsController.metrics);
adminRouter.get("/ops/summary", requireAdminSession, AdminOpsController.opsSummary);
adminRouter.get("/leads", requireAdminSession, AdminOpsController.leads);
adminRouter.get("/abuse/trials", requireAdminSession, AdminOpsController.abuseTrials);
adminRouter.get("/support/timeline", requireAdminSession, AdminOpsController.supportTimeline);
adminRouter.get("/exports/:kind", requireAdminSession, AdminOpsController.export);

adminRouter.use("/notifications", notificationsAdminRouter);
adminRouter.use("/cms", cmsAdminRouter);
