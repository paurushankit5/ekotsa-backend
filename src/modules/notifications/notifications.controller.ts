import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { NotificationsService } from "./notifications.service.js";
import { requireCron } from "../../middleware/requireCron.js";

const idSchema = Joi.object({
  id: Joi.string().required(),
  reason: Joi.string().max(500).allow("", null).optional(),
});

const listSchema = Joi.object({
  status: Joi.string().optional(),
  take: Joi.number().integer().min(1).max(300).default(100),
});


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
