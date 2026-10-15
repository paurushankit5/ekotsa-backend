import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { ReleasesService, verifySignedFileUrl } from "./releases.service.js";
import { getObjectStorage } from "../../services/local-object-storage.js";
import { isR2Configured } from "../../services/r2-storage.js";
import { toPublicReleaseManifest, type Platform } from "./releases.manifest.js";

const prepareSchema = Joi.object({
  product: Joi.string().trim().max(80).optional(),
  version: Joi.string()
    .trim()
    .pattern(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
    .required(),
  platform: Joi.string().valid("windows", "macos", "linux").required(),
  architecture: Joi.string().trim().min(1).max(40).default("x64"),
  fileName: Joi.string().trim().min(1).max(200).required(),
  contentType: Joi.string().trim().max(120).optional(),
  size: Joi.number().integer().min(1).required(),
  releaseNotesUrl: Joi.string().uri({ scheme: ["https", "http"] }).allow(null, "").optional(),
  signingStatus: Joi.string().valid("SIGNED", "UNSIGNED", "UNKNOWN").optional(),
  minimumSupportedVersion: Joi.string().max(40).allow(null, "").optional(),
});

const completeSchema = Joi.object({
  releaseId: Joi.string().required(),
  completeToken: Joi.string().min(16).required(),
  sha256: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .optional()
    .allow(null, ""),
});

const abortSchema = Joi.object({
  releaseId: Joi.string().required(),
  completeToken: Joi.string().min(16).optional().allow(null, ""),
});

const statusSchema = Joi.object({
  id: Joi.string().required(),
  status: Joi.string().valid("STABLE", "BETA", "ARCHIVED", "DELETED").required(),
});

export const ReleasesController = {
  async current(req: Request, res: Response, next: NextFunction) {
    try {
      const platform = String(req.query.platform || "");
      if (platform === "windows" || platform === "macos" || platform === "linux") {
        const release = await ReleasesService.getStableForPlatform(platform as Platform);
        res.json({
          ok: true,
          release: release ? toPublicReleaseManifest(release) : null,
        });
        return;
      }
      const { releases } = await ReleasesService.listPublic();
      res.json({ ok: true, releases });
    } catch (error) {
      next(error);
    }
  },

  async listPublic(_req: Request, res: Response, next: NextFunction) {
    try {
      const { releases } = await ReleasesService.listPublic();
      res.json({ ok: true, releases });
    } catch (error) {
      next(error);
    }
  },

  async listAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const includeDeleted = String(req.query.includeDeleted || "") === "1";
      const result = await ReleasesService.listAdmin({ includeDeleted });
      res.json({
        ok: true,
        ...result,
        storage: ReleasesService.storageStatus(),
      });
    } catch (error) {
      next(error);
    }
  },

  async prepare(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(prepareSchema, req.body);
      const result = await ReleasesService.prepareUpload({
        ...body,
        releaseNotesUrl: body.releaseNotesUrl || null,
        minimumSupportedVersion: body.minimumSupportedVersion || body.version,
        createdByAdminId: req.userSession.userId,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async complete(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(completeSchema, req.body);
      const result = await ReleasesService.completeUpload({
        releaseId: body.releaseId,
        completeToken: body.completeToken,
        sha256: body.sha256 || null,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async abort(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(abortSchema, req.body);
      const result = await ReleasesService.abortUpload({
        releaseId: body.releaseId,
        completeToken: body.completeToken || null,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async setStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(statusSchema, req.body);
      const result = await ReleasesService.setStatus({
        id: body.id,
        status: body.status,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  /** Legacy local-disk download fallback (R2 downloads use signed R2 URLs instead). */
  async downloadFile(req: Request, res: Response, next: NextFunction) {
    try {
      if (isR2Configured()) {
        // Prefer redirecting through authorize → R2; keep endpoint for old local rows.
      }
      const id = String(req.params.id);
      const exp = String(req.query.exp || "");
      const sig = String(req.query.sig || "");
      if (!verifySignedFileUrl(id, exp, sig)) {
        throw new AppError(401, "Download link expired or invalid", "DOWNLOAD_LINK_INVALID");
      }
      const row = await ReleasesService.getById(id);
      const stream = getObjectStorage().createReadStream(row.storageBucket, row.storagePath);
      if (!stream) throw new AppError(404, "Installer file missing", "INSTALLER_MISSING");

      res.setHeader("Content-Type", row.contentType || "application/octet-stream");
      res.setHeader("Content-Length", String(row.installerSize));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${row.fileName.replace(/"/g, "")}"`,
      );
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  },
};
