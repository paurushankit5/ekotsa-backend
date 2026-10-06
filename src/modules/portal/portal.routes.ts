import { Router } from "express";
import { requireUserSession } from "../../middleware/requireUserSession.js";
import { PortalController } from "./portal.controller.js";

/**
 * Wave E — customer portal
 * GET /v1/portal/overview
 * GET /v1/portal/device-resets
 * GET /v1/portal/recovery/:id
 */
export const portalRouter = Router();

portalRouter.get("/overview", requireUserSession, PortalController.overview);
portalRouter.get("/device-resets", requireUserSession, PortalController.deviceResets);
portalRouter.get(
  "/recovery/:id",
  requireUserSession,
  PortalController.downloadRecovery,
);
