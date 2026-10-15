import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { DeviceService } from "./devices.service.js";

const registerSchema = Joi.object({
  activationSessionToken: Joi.string().min(20).max(500).required(),
  deviceId: Joi.string().min(16).max(120).required(),
  installationId: Joi.string().min(8).max(200).optional(),
  deviceFingerprint: Joi.string().min(8).max(500).optional(),
  deviceName: Joi.string().min(1).max(80).required(),
  platform: Joi.string().min(1).max(40).required(),
  osName: Joi.string().min(1).max(40).optional(),
  osVersion: Joi.string().min(1).max(40).optional(),
  architecture: Joi.string().min(1).max(40).optional(),
  appVersion: Joi.string().min(1).max(40).optional(),
  publicKey: Joi.string().min(16).max(5000).optional(),
  metadata: Joi.object().unknown(true).optional(),
});

const revokeSchema = Joi.object({
  reason: Joi.string().min(1).max(200).optional(),
});

export const DeviceController = {
  async createActivationSession(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) {
        throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      }
      const result = await DeviceService.createActivationSession({
        userId: req.userSession.userId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({
        ok: true,
        activationSession: {
          token: result.token,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(registerSchema, req.body);
      const result = await DeviceService.register({
        ...body,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({
        ok: true,
        device: result.device,
        deviceAuth: result.deviceAuth,
      });
    } catch (error) {
      next(error);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.deviceAuth) {
        throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      }
      const result = await DeviceService.getMe(req.deviceAuth.deviceId, req.deviceAuth.tokenId);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.deviceAuth) {
        throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      }
      const body = validateOrThrow(revokeSchema, req.body ?? {});
      const result = await DeviceService.revoke({
        deviceId: req.deviceAuth.deviceId,
        reason: body.reason,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
