import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { loadEnv } from "../../config/env.js";
import { NotificationsService } from "./notifications.service.js";

const idSchema = Joi.object({
  id: Joi.string().required(),
  reason: Joi.string().max(500).allow("", null).optional(),
});

const listSchema = Joi.object({
  status: Joi.string().optional(),
  take: Joi.number().integer().min(1).max(300).default(100),
});

function requireCron(req: Request) {
  const env = loadEnv();
  const expected = env.CRON_SECRET;
  if (!expected) {
    throw new AppError(503, "CRON_SECRET not configured", "CRON_NOT_CONFIGURED");
  }
  const token = req.header("x-cron-token");
  if (!token || token !== expected) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }
}

export const NotificationsController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = validateOrThrow(listSchema, req.query);
      const result = await NotificationsService.list(query);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async templates(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await NotificationsService.templateStats();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async sendNow(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(idSchema, req.body);
      const result = await NotificationsService.sendNow({
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

  async retry(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(idSchema, req.body);
      const result = await NotificationsService.retry({
        id: body.id,
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(idSchema, req.body);
      const result = await NotificationsService.cancel({
        id: body.id,
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async process(req: Request, res: Response, next: NextFunction) {
    try {
      requireCron(req);
      const take = req.body?.take ? Number(req.body.take) : 25;
      const result = await NotificationsService.process(take);
      res.json({ ok: true, result });
    } catch (error) {
      next(error);
    }
  },

  async schedule(req: Request, res: Response, next: NextFunction) {
    try {
      requireCron(req);
      const result = await NotificationsService.scheduleExpiryReminders();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
