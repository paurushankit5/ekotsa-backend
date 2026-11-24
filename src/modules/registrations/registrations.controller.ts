import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { OrganizationsService, RegistrationsService } from "./registrations.service.js";
import { setDownloadSessionCookie } from "../downloads/downloads.cookies.js";
import { privacyFields, type PrivacyInput } from "../privacy/privacy.schema.js";
import { PrivacyService } from "../privacy/privacy.service.js";
import { assertCurrentNotice } from "../privacy/notices.js";
import { ChoicesService } from "../privacy/choices.service.js";

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
  termsAccepted: Joi.boolean().valid(true).required().messages({
    "any.only": "Please accept the Terms of Use to continue.",
  }),
  // Consent to use these details for the download/trial purpose described in the notice.
  privacyAcknowledged: Joi.boolean().valid(true).required().messages({
    "any.only": "Please agree to Ekotsa using these details as described in the notice.",
  }),
  /** Version of the marketing notice shown next to the optional product-updates box. */
  marketingNoticeVersion: Joi.string().max(40).optional(),
  whatsappCountryCode: Joi.string().max(8).optional(),
  ...privacyFields,
});

const statusSchema = Joi.object({
  email: Joi.string().email().optional(),
  registrationId: Joi.string().optional(),
});

export const RegistrationsController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(createSchema, req.body);
      assertCurrentNotice("download", body.noticeVersion);
      if (body.marketingConsent && body.ageCategory === "ADULT") assertCurrentNotice("marketing_email", body.marketingNoticeVersion);
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
      const consent = await PrivacyService.recordConsent({
        subjectType: "REGISTRATION",
        subjectId: result.registration.id,
        noticeKey: "download",
        email: body.email,
        childName: body.fullName,
        purposes: ["download_registration"],
        privacy: body as unknown as PrivacyInput,
        termsAccepted: body.termsAccepted,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      // Optional product updates: a separate, unticked choice — never for under-18s.
      if (body.marketingConsent && body.ageCategory === "ADULT") {
        await ChoicesService.record({
          subject: { type: "EMAIL", id: body.email.trim().toLowerCase() },
          purpose: "marketing_email",
          action: "GRANT",
          noticeVersion: body.marketingNoticeVersion,
          source: "download_form",
          email: body.email,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        });
      }
      // Under-18: downloads stay blocked until a parent/guardian approves (checked at authorize).
      setDownloadSessionCookie(
        res,
        result.downloadAuth.token,
        new Date(result.downloadAuth.expiresAt),
      );
      res
        .status(result.created ? 201 : 200)
        .json({ ok: true, ...result, guardianStatus: consent.guardianStatus });
    } catch (error) {
      next(error);
    }
  },

  async status(req: Request, res: Response, next: NextFunction) {
    try {
      const query = validateOrThrow(statusSchema, req.query);
      if (query.email || query.registrationId) {
        if (!req.userSession) throw new AppError(401, "Login required", "UNAUTHORIZED");
        if (query.email && query.email.trim().toLowerCase() !== req.userSession.email.toLowerCase()) {
          throw new AppError(403, "Registration access denied", "FORBIDDEN");
        }
        const result = await RegistrationsService.status(query);
        if (query.registrationId && result.registration.linkedUserId !== req.userSession.userId) {
          throw new AppError(403, "Registration access denied", "FORBIDDEN");
        }
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
