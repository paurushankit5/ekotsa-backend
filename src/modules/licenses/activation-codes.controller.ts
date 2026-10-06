import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../middleware/errorHandler.js";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { ActivationCodesService } from "./activation-codes.service.js";

const generateSchema = Joi.object({
  plan: Joi.string().min(1).max(80).required(),
  expiresInDays: Joi.number().integer().min(1).max(3650).optional(),
});

const listSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(500).default(500),
});

const redeemSchema = Joi.object({
  code: Joi.string().min(8).max(120).required(),
});

export const ActivationCodesController = {
  async generate(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(generateSchema, req.body);
      const result = await ActivationCodesService.generate(body);
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = validateOrThrow(listSchema, req.query);
      const result = await ActivationCodesService.list(query);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async redeem(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(redeemSchema, req.body);
      const result = await ActivationCodesService.redeem({
        userId: req.userSession.userId,
        code: body.code,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
