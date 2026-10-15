import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { LicenseService } from "./licenses.service.js";

const createGrantSchema = Joi.object({
  userId: Joi.string().min(1).max(120).required(),
  deviceId: Joi.string().min(1).max(120).required(),
  plan: Joi.string().min(1).max(80).default("standard"),
  durationDays: Joi.number().integer().min(1).max(3650).optional(),
  expiresAt: Joi.date().iso().optional(),
  reason: Joi.string().max(500).optional(),
});

const revokeGrantSchema = Joi.object({
  grantId: Joi.string().min(1).max(120).required(),
  reason: Joi.string().max(500).optional(),
});

const listGrantsSchema = Joi.object({
  userId: Joi.string().min(1).max(120).optional(),
  deviceId: Joi.string().min(1).max(120).optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

const userStatusSchema = Joi.object({
  userId: Joi.string().min(1).max(120).required(),
});

const extendGrantSchema = Joi.object({
  grantId: Joi.string().min(1).max(120).optional(),
  userId: Joi.string().min(1).max(120).optional(),
  deviceId: Joi.string().min(1).max(120).optional(),
  durationDays: Joi.number().integer().min(1).max(3650).required(),
  plan: Joi.string().min(1).max(80).optional(),
  reason: Joi.string().max(500).optional(),
})
  .or("grantId", "userId")
  .custom((value, helpers) => {
    if (value.grantId) return value;
    if (value.userId && value.deviceId) return value;
    return helpers.error("any.custom", {
      message: "Provide grantId, or userId and deviceId",
    });
  });

export const LicenseAdminController = {
  async createGrant(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(createGrantSchema, req.body);
      const result = await LicenseService.createGrant({
        userId: body.userId,
        deviceId: body.deviceId,
        plan: body.plan,
        durationDays: body.durationDays,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        reason: body.reason,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async revokeGrant(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(revokeGrantSchema, req.body);
      const result = await LicenseService.revokeGrant(body);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async listGrants(req: Request, res: Response, next: NextFunction) {
    try {
      const query = validateOrThrow(listGrantsSchema, req.query);
      const result = await LicenseService.listGrants(query);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async userStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const query = validateOrThrow(userStatusSchema, req.query);
      const result = await LicenseService.userStatus(query);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async extendGrant(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(extendGrantSchema, req.body);
      const result = await LicenseService.extendGrant(body);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
