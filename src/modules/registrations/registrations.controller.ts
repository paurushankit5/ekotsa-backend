import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { OrganizationsService, RegistrationsService } from "./registrations.service.js";
import { setDownloadSessionCookie } from "../downloads/downloads.cookies.js";

const createSchema = Joi.object({
  fullName: Joi.string().trim().min(1).max(120).required(),
  organizationName: Joi.string().trim().min(1).max(200).required(),
  email: Joi.string().email().max(254).required(),
  contactCountryCode: Joi.string().trim().min(1).max(8).required(),
  contactNumber: Joi.string().trim().min(6).max(40).required(),
  industry: Joi.string().trim().min(1).max(120).required(),
  businessAddress: Joi.string().trim().min(3).max(1000).required(),
  whatsappNumber: Joi.string().max(40).optional(),
  source: Joi.string().max(80).optional(),
  // Accepted from the website form but not persisted separately (lead gate only).
  termsAccepted: Joi.boolean().optional(),
  privacyAcknowledged: Joi.boolean().optional(),
  marketingConsent: Joi.boolean().optional(),
  termsVersion: Joi.string().max(40).optional(),
  privacyVersion: Joi.string().max(40).optional(),
  whatsappCountryCode: Joi.string().max(8).optional(),
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
        fullName: body.fullName,
        organizationName: body.organizationName,
        email: body.email,
        contactCountryCode: body.contactCountryCode,
        contactNumber: body.contactNumber,
        industry: body.industry,
        businessAddress: body.businessAddress,
        whatsappNumber: body.whatsappNumber,
        source: body.source,
        linkedUserId: req.userSession?.userId ?? null,
      });
      setDownloadSessionCookie(
        res,
        result.downloadAuth.token,
        new Date(result.downloadAuth.expiresAt),
      );
      res.status(result.created ? 201 : 200).json({ ok: true, ...result });
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
