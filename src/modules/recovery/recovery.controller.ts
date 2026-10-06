import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { RecoveryService } from "./recovery.service.js";

const requestSchema = Joi.object({
  grantId: Joi.string().required(),
  reason: Joi.string().max(500).allow("", null).optional(),
  note: Joi.string().max(2000).allow("", null).optional(),
});

const approveSchema = Joi.object({
  requestId: Joi.string().required(),
  reason: Joi.string().max(500).allow("", null).optional(),
  expiresInHours: Joi.number().integer().min(1).max(24 * 30).default(24 * 7),
});

const rejectSchema = Joi.object({
  requestId: Joi.string().required(),
  reason: Joi.string().max(500).allow("", null).optional(),
});

const issueSchema = Joi.object({
  grantId: Joi.string().required(),
  reason: Joi.string().max(500).allow("", null).optional(),
  expiresInHours: Joi.number().integer().min(1).max(24 * 30).default(24 * 7),
});

const revokeSchema = Joi.object({
  id: Joi.string().required(),
  reason: Joi.string().max(500).allow("", null).optional(),
});

export const RecoveryController = {
  async request(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(requestSchema, req.body);
      const result = await RecoveryService.createRequest({
        userId: req.userSession.userId,
        email: req.userSession.email,
        grantId: body.grantId,
        reason: body.reason,
        note: body.note,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await RecoveryService.status(req.userSession.userId);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async download(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await RecoveryService.getDownloadableArtifact({
        id: String(req.params.id),
        userId: req.userSession.userId,
      });
      res.setHeader("content-type", "application/json");
      res.setHeader(
        "content-disposition",
        `attachment; filename="${result.filename}"`,
      );
      res.send(result.artifactJson);
    } catch (error) {
      next(error);
    }
  },

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(approveSchema, req.body);
      const result = await RecoveryService.issueArtifact({
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
        grantId: "",
        requestId: body.requestId,
        reason: body.reason,
        expiresInHours: body.expiresInHours,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(rejectSchema, req.body);
      const result = await RecoveryService.rejectRequest({
        requestId: body.requestId,
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
        reason: body.reason,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async issueDirect(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(issueSchema, req.body);
      const result = await RecoveryService.issueArtifact({
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
        grantId: body.grantId,
        reason: body.reason,
        expiresInHours: body.expiresInHours,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async listArtifacts(req: Request, res: Response, next: NextFunction) {
    try {
      const take = req.query.take ? Number(req.query.take) : 100;
      const result = await RecoveryService.listArtifacts({ take });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async revokeArtifact(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(revokeSchema, req.body);
      const result = await RecoveryService.revokeArtifact({
        id: body.id,
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
        reason: body.reason,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
