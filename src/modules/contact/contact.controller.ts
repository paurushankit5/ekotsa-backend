import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { ContactService } from "./contact.service.js";
import { privacyFields, type PrivacyInput } from "../privacy/privacy.schema.js";
import { PrivacyService } from "../privacy/privacy.service.js";
import { assertCurrentNotice } from "../privacy/notices.js";

const contactSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  organization: Joi.string().trim().min(1).max(160).required(),
  // The website marks email as optional; phone is the required channel.
  email: Joi.string().trim().email().max(320).allow("", null).optional(),
  countryCode: Joi.string().trim().max(8).required(),
  phone: Joi.string().trim().max(32).required(),
  whatsapp: Joi.string().trim().max(32).allow("", null).optional(),
  useWhatsapp: Joi.boolean().optional(),
  enquiry: Joi.string().trim().max(60).optional(),
  requirement: Joi.string().trim().max(2000).allow("", null).optional(),
  consent: Joi.boolean().valid(true).required().messages({
    "any.only": "Please confirm that Ekotsa may use these details to respond to your enquiry.",
  }),
  ...privacyFields,
});

const assessmentSchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  organization: Joi.string().trim().min(1).max(160).required(),
  email: Joi.string().email().max(320).required(),
  phone: Joi.string().trim().max(40).required(),
  industry: Joi.string().trim().max(120).allow("", null).optional(),
  requirement: Joi.string().trim().min(1).max(2000).required(),
  consent: Joi.boolean().valid(true).required().messages({
    "any.only": "Please confirm that Ekotsa may use these details to review your request.",
  }),
  ...privacyFields,
});

export const ContactController = {
  async contact(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(contactSchema, req.body);
      assertCurrentNotice("contact", body.noticeVersion);
      const privacy = body as unknown as PrivacyInput;
      const isMinor = privacy.ageCategory === "MINOR";
      const whatsapp = body.whatsapp?.trim() || (body.useWhatsapp ? body.phone : "");
      const result = await ContactService.createContact({
        name: body.name,
        organization: body.organization,
        email: body.email || "",
        countryCode: body.countryCode,
        phone: body.phone,
        whatsapp,
        requirement: [body.enquiry ? `[Enquiry: ${body.enquiry}]` : "", body.requirement || ""]
          .filter(Boolean)
          .join("\n") || null,
        holdForGuardian: isMinor,
      });
      const consent = await PrivacyService.recordConsent({
        subjectType: "CONTACT_LEAD",
        subjectId: result.leadId,
        noticeKey: "contact",
        email: body.email || null,
        childName: body.name,
        purposes: ["enquiry"],
        privacy,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({ ok: true, ...result, guardianStatus: consent.guardianStatus });
    } catch (error) {
      next(error);
    }
  },

  async businessAssessment(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(assessmentSchema, req.body);
      assertCurrentNotice("assessment", body.noticeVersion);
      const privacy = body as unknown as PrivacyInput;
      const result = await ContactService.createBusinessAssessment({
        ...body,
        holdForGuardian: privacy.ageCategory === "MINOR",
      });
      const consent = await PrivacyService.recordConsent({
        subjectType: "CONTACT_LEAD",
        subjectId: result.leadId,
        noticeKey: "assessment",
        email: body.email,
        childName: body.name,
        purposes: ["assessment"],
        privacy,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({ ok: true, ...result, guardianStatus: consent.guardianStatus });
    } catch (error) {
      next(error);
    }
  },
};
