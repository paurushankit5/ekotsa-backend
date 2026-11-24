import { Router } from "express";
import { requireUserSession } from "../../middleware/requireUserSession.js";
import { DownloadsController } from "./downloads.controller.js";
import { rateLimit } from "../../middleware/rateLimit.js";

/**
 * Wave C — downloads
 * POST /v1/downloads/session    — create short-lived download token (user cookie)
 * POST /v1/downloads/authorize  — consume token → installer URL
 * POST /v1/downloads            — analytics event
 */
export const downloadsRouter = Router();

downloadsRouter.post("/session", requireUserSession, DownloadsController.createSession);
downloadsRouter.post("/authorize", rateLimit({ keyPrefix: "download-authorize", windowMs: 60_000, max: 30 }), DownloadsController.authorize);
downloadsRouter.post("/", rateLimit({ keyPrefix: "download-event", windowMs: 60_000, max: 30 }), DownloadsController.record);
