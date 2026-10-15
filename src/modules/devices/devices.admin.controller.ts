import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { DeviceService } from "./devices.service.js";

const listSchema = Joi.object({
  userId: Joi.string().min(1).max(120).optional(),
  limit: Joi.number().integer().min(1).max(500).default(500),
});

const revokeSchema = Joi.object({
  deviceId: Joi.string().min(1).max(120).required(),
  reason: Joi.string().max(500).optional(),
});

export const DeviceAdminController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = validateOrThrow(listSchema, req.query);
      const result = await DeviceService.listAdmin(query);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async revoke(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(revokeSchema, req.body);
      const result = await DeviceService.revoke(body);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
