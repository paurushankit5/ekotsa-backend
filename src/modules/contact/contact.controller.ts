import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { ContactService } from "./contact.service.js";

const contactSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  organization: Joi.string().trim().min(1).max(160).required(),
  email: Joi.string().email().max(320).required(),
  countryCode: Joi.string().trim().max(8).required(),
  phone: Joi.string().trim().max(32).required(),
  whatsapp: Joi.string().trim().max(32).required(),
  requirement: Joi.string().trim().max(2000).allow("", null).optional(),
});

const assessmentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  organization: Joi.string().trim().min(1).max(160).required(),
  email: Joi.string().email().max(320).required(),
  phone: Joi.string().trim().max(40).required(),
  industry: Joi.string().trim().max(120).allow("", null).optional(),
  requirement: Joi.string().trim().min(1).max(2000).required(),
});

export const ContactController = {
  async contact(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(contactSchema, req.body);
      const result = await ContactService.createContact(body);
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async businessAssessment(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(assessmentSchema, req.body);
      const result = await ContactService.createBusinessAssessment(body);
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
