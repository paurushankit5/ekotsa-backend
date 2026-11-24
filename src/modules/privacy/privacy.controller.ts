import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { requireCron } from "../../middleware/requireCron.js";
import { User } from "../../db/models/index.js";
import {
  ageUpdateSchema,
  guardianDecisionSchema,
  guardianTokenSchema,
  guardianVerificationSchema,
  TERMS_VERSION,
  type PrivacyInput,
} from "./privacy.schema.js";
import { PrivacyService } from "./privacy.service.js";
import { PrivacyRequestsService } from "./privacy-requests.service.js";
import { RetentionService } from "./retention.service.js";
import { LegalHoldsService } from "./legal-holds.service.js";
import { AnonId, ANON_COOKIE, CHOICE_PURPOSES, ChoicesService, type ChoiceSubject } from "./choices.service.js";
import { MarketingService } from "./marketing.service.js";
import { getNotices, OPERATOR } from "./notices.js";

const submitRequestSchema = Joi.object({
  type: Joi.string().valid("ACCESS", "CORRECTION", "ERASURE", "WITHDRAW_CONSENT", "NOMINATION", "GRIEVANCE", "OTHER").required(),
  requesterRole: Joi.string().valid("SELF", "PARENT_GUARDIAN", "NOMINEE", "AUTHORISED_AGENT").default("SELF"),
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(254).required(),
  phone: Joi.string().trim().max(40).allow("", null).optional(),
  details: Joi.string().trim().min(5).max(4000).required(),
  noticeVersion: Joi.string().max(40).optional(),
});

const adminUpdateSchema = Joi.object({
  status: Joi.string().valid("IN_PROGRESS", "RESOLVED", "REJECTED").required(),
  resolutionNote: Joi.string().trim().max(4000).allow("", null).optional(),
  scope: Joi.string().trim().max(2000).allow("", null).optional(),
  exemptionNote: Joi.string().trim().max(2000).allow("", null).optional(),
  assignToMe: Joi.boolean().optional(),
});

const choiceSchema = Joi.object({
  purpose: Joi.string().valid(...CHOICE_PURPOSES).required(),
  action: Joi.string().valid("GRANT", "DECLINE", "WITHDRAW").required(),
  noticeVersion: Joi.string().max(40).allow(null, "").optional(),
  idempotencyKey: Joi.string().trim().min(8).max(100).optional(),
  source: Joi.string().trim().max(60).default("website"),
});

const unsubscribeSchema = Joi.object({ token: Joi.string().trim().min(20).max(500).required() }).unknown(true);
const unsubscribeLinkSchema = Joi.object({ email: Joi.string().trim().email({ tlds: { allow: false } }).max(254).required() });
const legalHoldSchema = Joi.object({
  subjectType: Joi.string().valid("USER", "REGISTRATION", "CONTACT_LEAD", "EMAIL").required(),
  subjectId: Joi.string().trim().max(100).allow("", null).optional(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(254).allow("", null).optional(),
  reason: Joi.string().trim().min(5).max(2000).required(),
});
const purgeSchema = Joi.object({ dryRun: Joi.boolean().default(false) });

/** Signed-in user, or a signed anonymous browser ID (issued on first need). */
function choiceSubject(req: Request, res: Response, issueIfMissing: boolean): ChoiceSubject | null {
  if (req.userSession) return { type: "USER", id: req.userSession.userId };
  const existing = AnonId.verify(req.cookies?.[ANON_COOKIE]);
  if (existing) return { type: "ANON", id: existing };
  if (!issueIfMissing) return null;
  const issued = AnonId.issue();
  res.cookie(ANON_COOKIE, issued.cookie, AnonId.cookieOptions());
  return { type: "ANON", id: issued.id };
}

export const PrivacyController = {
  /** Point-of-collection notices (all, or ?keys=contact,analytics). */
  async notices(req: Request, res: Response, next: NextFunction) {
    try {
      const keys = typeof req.query.keys === "string" ? req.query.keys.split(",").map((k) => k.trim()) : undefined;
      res.set("Cache-Control", "public, max-age=300");
      res.json({ ok: true, termsVersion: TERMS_VERSION, ...getNotices(keys) });
    } catch (error) {
      next(error);
    }
  },

  /** The signed-in user's age/guardian status. */
  async status(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.userSession ? await PrivacyService.getStatus("USER", req.userSession.userId) : null;
      res.json({ ok: true, status });
    } catch (error) {
      next(error);
    }
  },

  /** Age confirmation for older accounts created through Google before the sign-up step existed. */
  async confirmAge(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(ageUpdateSchema, req.body) as PrivacyInput & { termsAccepted: boolean };
      const existing = await PrivacyService.getStatus("USER", req.userSession.userId);
      if (existing.ageCategory) {
        throw new AppError(409, "Age has already been confirmed for this account.", "AGE_ALREADY_CONFIRMED");
      }
      const user = await User.findByPk(req.userSession.userId);
      const result = await PrivacyService.recordConsent({
        subjectType: "USER",
        subjectId: req.userSession.userId,
        noticeKey: "google_signup",
        email: req.userSession.email,
        childName: user?.name ?? null,
        purposes: ["account"],
        privacy: body,
        termsAccepted: body.termsAccepted,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({ ok: true, ...result, signOut: result.guardianStatus === "PENDING" });
    } catch (error) {
      next(error);
    }
  },

  /** Effective optional choices for the requester only (user, or this browser). */
  async getChoices(req: Request, res: Response, next: NextFunction) {
    try {
      const subject = choiceSubject(req, res, false);
      const subjects: ChoiceSubject[] = subject ? [subject] : [];
      if (req.userSession) subjects.push({ type: "EMAIL", id: req.userSession.email.toLowerCase() });
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, choices: await ChoicesService.effective(subjects) });
    } catch (error) {
      next(error);
    }
  },

  async recordChoice(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(choiceSchema, req.body);
      if (body.purpose === "marketing_email" && !req.userSession) {
        throw new AppError(401, "Sign in to change email preferences, or use the unsubscribe link in any email.", "UNAUTHORIZED");
      }
      const subject = choiceSubject(req, res, true)!;
      const result = await ChoicesService.record({
        subject,
        purpose: body.purpose,
        action: body.action,
        noticeVersion: body.noticeVersion,
        source: body.source,
        idempotencyKey: body.idempotencyKey,
        email: body.purpose === "marketing_email" ? req.userSession!.email : null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  /** Unsubscribe (page POST with JSON, or RFC 8058 one-click form POST with ?token=). */
  async unsubscribe(req: Request, res: Response, next: NextFunction) {
    try {
      const token = typeof req.query.token === "string" ? req.query.token : req.body?.token;
      const body = validateOrThrow(unsubscribeSchema, { token });
      const oneClick = req.body?.["List-Unsubscribe"] === "One-Click";
      await MarketingService.unsubscribe(body.token, oneClick ? "ONE_CLICK" : "UNSUBSCRIBE_LINK", req.ip);
      res.set("Cache-Control", "no-store");
      res.json({ ok: true, unsubscribed: true });
    } catch (error) {
      next(error);
    }
  },

  async unsubscribeLink(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(unsubscribeLinkSchema, req.body);
      await MarketingService.sendNewLink(body.email);
      res.json({ ok: true, message: "If we hold this address, we have emailed it a new unsubscribe link." });
    } catch (error) {
      next(error);
    }
  },

  async guardianLookup(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(guardianTokenSchema, req.query);
      const request = await PrivacyService.lookupGuardianRequest(body.token);
      res.json({ ok: true, request, termsVersion: TERMS_VERSION, operator: OPERATOR });
    } catch (error) {
      next(error);
    }
  },

  async guardianRespond(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(guardianDecisionSchema, req.body);
      const result = await PrivacyService.respondToGuardianRequest({ token: body.token, decision: body.decision, ip: req.ip });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async submitRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(submitRequestSchema, req.body);
      const result = await PrivacyRequestsService.submit({ ...body, sessionEmail: req.userSession?.email ?? null });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async verifyRequest(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(guardianTokenSchema, req.body);
      res.json({ ok: true, ...(await PrivacyRequestsService.verify(body.token)) });
    } catch (error) {
      next(error);
    }
  },

  // ---------- Admin ----------
  async adminList(req: Request, res: Response, next: NextFunction) {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json({ ok: true, ...(await PrivacyRequestsService.list({ status })) });
    } catch (error) {
      next(error);
    }
  },

  async adminUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(adminUpdateSchema, req.body);
      const result = await PrivacyRequestsService.update({
        id: String(req.params.id),
        ...body,
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async adminGuardianList(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, records: await PrivacyService.listAwaitingVerification() });
    } catch (error) {
      next(error);
    }
  },

  async adminGuardianVerify(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(guardianVerificationSchema, req.body);
      const result = await PrivacyService.verifyGuardian({
        consentId: String(req.params.id),
        decision: body.decision,
        method: body.method,
        note: body.note,
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async adminHoldList(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, holds: await LegalHoldsService.list() });
    } catch (error) {
      next(error);
    }
  },

  async adminHoldCreate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(legalHoldSchema, req.body);
      const result = await LegalHoldsService.create({ ...body, adminUserId: req.userSession.userId, adminEmail: req.userSession.email });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async adminHoldRelease(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      res.json({
        ok: true,
        ...(await LegalHoldsService.release({ id: String(req.params.id), adminUserId: req.userSession.userId, adminEmail: req.userSession.email })),
      });
    } catch (error) {
      next(error);
    }
  },

  /** Daily retention job (guardian expiry, retention schedule, inactive accounts, request SLAs). */
  async purge(req: Request, res: Response, next: NextFunction) {
    try {
      requireCron(req);
      const body = validateOrThrow(purgeSchema, req.body ?? {});
      res.json({ ok: true, ...(await RetentionService.run({ dryRun: body.dryRun })) });
    } catch (error) {
      next(error);
    }
  },
};
