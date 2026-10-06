import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { LicenseService } from "./licenses.service.js";

const refreshSchema = Joi.object({
  deviceId: Joi.string().min(1).max(120).optional(),
});

export const LicenseController = {
  async issue(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.deviceAuth) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await LicenseService.issue({
        userId: req.deviceAuth.userId,
        deviceId: req.deviceAuth.deviceId,
        tokenId: req.deviceAuth.tokenId,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.deviceAuth) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await LicenseService.status({
        userId: req.deviceAuth.userId,
        deviceId: req.deviceAuth.deviceId,
        tokenId: req.deviceAuth.tokenId,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.deviceAuth) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(refreshSchema, req.body ?? {});
      const result = await LicenseService.refresh({
        userId: req.deviceAuth.userId,
        deviceId: req.deviceAuth.deviceId,
        tokenId: req.deviceAuth.tokenId,
        requestedDeviceId: body.deviceId,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
