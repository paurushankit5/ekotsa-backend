import { Router } from "express";
import { requireAdminSession } from "../../middleware/requireUserSession.js";
import { ReleasesController } from "./releases.controller.js";

/**
 * Public:
 *   GET  /v1/releases/current
 *   GET  /v1/releases
 *   GET  /v1/releases/files/:id   (legacy local fallback)
 *
 * Admin:
 *   GET  /v1/admin/releases
 *   POST /v1/admin/releases/prepare   → R2 presigned PUT
 *   POST /v1/admin/releases/complete  → verify object in R2
 *   POST /v1/admin/releases/abort     → rollback failed upload
 *   POST /v1/admin/releases/status
 */
export const releasesRouter = Router();
releasesRouter.get("/current", ReleasesController.current);
releasesRouter.get("/", ReleasesController.listPublic);
releasesRouter.get("/files/:id", ReleasesController.downloadFile);

export const releasesAdminRouter = Router();
releasesAdminRouter.get("/", requireAdminSession, ReleasesController.listAdmin);
releasesAdminRouter.post("/prepare", requireAdminSession, ReleasesController.prepare);
releasesAdminRouter.post("/complete", requireAdminSession, ReleasesController.complete);
releasesAdminRouter.post("/abort", requireAdminSession, ReleasesController.abort);
releasesAdminRouter.post("/status", requireAdminSession, ReleasesController.setStatus);
