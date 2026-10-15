import { Router } from "express";
import { requireAdminSession } from "../../middleware/requireUserSession.js";
import { NotificationsController } from "./notifications.controller.js";

/**
 * Wave F — notification admin + internal cron
 * Admin routes are mounted under /v1/admin/notifications
 * Internal under /v1/internal/notifications
 */
export const notificationsAdminRouter = Router();
notificationsAdminRouter.get("/", requireAdminSession, NotificationsController.list);
notificationsAdminRouter.get(
  "/templates",
  requireAdminSession,
  NotificationsController.templates,
);
notificationsAdminRouter.post(
  "/send-now",
  requireAdminSession,
  NotificationsController.sendNow,
);
notificationsAdminRouter.post("/retry", requireAdminSession, NotificationsController.retry);
notificationsAdminRouter.post(
  "/cancel",
  requireAdminSession,
  NotificationsController.cancel,
);

export const notificationsInternalRouter = Router();
notificationsInternalRouter.post("/process", NotificationsController.process);
notificationsInternalRouter.post("/schedule", NotificationsController.schedule);

/** Kept for /v1/notifications/_status compatibility */
export const notificationsRouter = Router();
notificationsRouter.get("/_status", (_req, res) => {
  res.json({ ok: true, domain: "notifications", status: "live" });
});
