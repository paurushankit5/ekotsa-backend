import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { OrganizationsService, RegistrationsService } from "./registrations.service.js";

const createSchema = Joi.object({
  fullName: Joi.string().trim().min(1).max(120).required(),
  organizationName: Joi.string().trim().min(1).max(200).required(),
  email: Joi.string().email().max(254).required(),
  contactCountryCode: Joi.string().max(8).optional(),
  contactNumber: Joi.string().max(40).optional(),
  whatsappNumber: Joi.string().max(40).optional(),
  source: Joi.string().max(80).optional(),
});

const statusSchema = Joi.object({
  email: Joi.string().email().optional(),
  registrationId: Joi.string().optional(),
});

export const RegistrationsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(createSchema, req.body);
      const result = await RegistrationsService.create({
        ...body,
        linkedUserId: req.userSession?.userId ?? null,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      const query = validateOrThrow(statusSchema, req.query);
      if (query.email || query.registrationId) {
        const result = await RegistrationsService.status(query);
        res.json({ ok: true, ...result });
        return;
      }
      if (req.userSession) {
        const result = await RegistrationsService.status({ userId: req.userSession.userId });
        res.json({ ok: true, ...result });
        return;
      }
      throw new AppError(400, "Provide email, registrationId, or login", "VALIDATION_ERROR");
    } catch (error) {
      next(error);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await RegistrationsService.status({ userId: req.userSession.userId });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};

export const OrganizationsController = {
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const org = await OrganizationsService.getById(String(req.params.id));
      res.json({ ok: true, organization: org });
    } catch (error) {
      next(error);
    }
  },
};
