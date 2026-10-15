import { Router } from "express";
import {
  requireAdminSession,
  requireUserSession,
} from "../../middleware/requireUserSession.js";
import { RecoveryController } from "./recovery.controller.js";

/**
 * Wave E — license recovery
 */
export const recoveryRouter = Router();

recoveryRouter.post("/request", requireUserSession, RecoveryController.request);
recoveryRouter.get("/status", requireUserSession, RecoveryController.status);
recoveryRouter.post("/approve", requireAdminSession, RecoveryController.approve);
recoveryRouter.post("/reject", requireAdminSession, RecoveryController.reject);
recoveryRouter.get("/:id", requireUserSession, RecoveryController.download);
