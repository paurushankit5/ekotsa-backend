import express, { Router, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "../../middleware/rateLimit.js";
import { requireUserSession } from "../../middleware/requireUserSession.js";
import { extractAccessToken, verifySession } from "../auth/auth.crypto.js";
import { PrivacyController } from "./privacy.controller.js";

/** Attach the session when present, without requiring it. */
async function optionalSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractAccessToken(req);
    if (token) {
      const session = await verifySession(token);
      if (session) req.userSession = session;
    }
  } catch {
    // anonymous
  }
  next();
}

/**
 * GET  /v1/privacy/notices?keys=…            point-of-collection notices (versioned)
 * GET  /v1/privacy/status                     signed-in user's age/guardian status
 * POST /v1/privacy/age                        age + Terms for older Google accounts
 * GET  /v1/privacy/choices                    requester's effective optional choices
 * POST /v1/privacy/choices                    append GRANT/DECLINE/WITHDRAW (analytics; marketing when signed in)
 * GET  /v1/privacy/guardian-consent?token=
 * POST /v1/privacy/guardian-consent           { token, decision, guardianDeclaration }
 * POST /v1/privacy/requests                   rights request / grievance
 * POST /v1/privacy/requests/verify            { token }
 * POST /v1/marketing/unsubscribe              { token } or ?token= (RFC 8058 one-click)
 * POST /v1/marketing/unsubscribe-link         { email } → neutral response
 */
export const privacyRouter = Router();
privacyRouter.get("/notices", PrivacyController.notices);
privacyRouter.get("/status", optionalSession, PrivacyController.status);
privacyRouter.post("/age", rateLimit({ keyPrefix: "privacy-age", windowMs: 60_000, max: 10 }), requireUserSession, PrivacyController.confirmAge);
privacyRouter.get("/choices", rateLimit({ keyPrefix: "privacy-choices-read", windowMs: 60_000, max: 60 }), optionalSession, PrivacyController.getChoices);
privacyRouter.post("/choices", rateLimit({ keyPrefix: "privacy-choices", windowMs: 60_000, max: 30 }), optionalSession, PrivacyController.recordChoice);
privacyRouter.get("/guardian-consent", rateLimit({ keyPrefix: "privacy-guardian-lookup", windowMs: 60_000, max: 30 }), PrivacyController.guardianLookup);
privacyRouter.post("/guardian-consent", rateLimit({ keyPrefix: "privacy-guardian-respond", windowMs: 60_000, max: 10 }), PrivacyController.guardianRespond);
privacyRouter.post("/requests", rateLimit({ keyPrefix: "privacy-request-submit", windowMs: 60 * 60_000, max: 5 }), optionalSession, PrivacyController.submitRequest);
privacyRouter.post("/requests/verify", rateLimit({ keyPrefix: "privacy-request-verify", windowMs: 60_000, max: 10 }), PrivacyController.verifyRequest);

export const marketingRouter = Router();
// RFC 8058 one-click POSTs are form-encoded ("List-Unsubscribe=One-Click").
marketingRouter.post(
  "/unsubscribe",
  rateLimit({ keyPrefix: "marketing-unsubscribe", windowMs: 60_000, max: 30 }),
  express.urlencoded({ extended: false, limit: "4kb" }),
  PrivacyController.unsubscribe,
);
marketingRouter.post(
  "/unsubscribe-link",
  rateLimit({ keyPrefix: "marketing-unsubscribe-link", windowMs: 60 * 60_000, max: 5 }),
  PrivacyController.unsubscribeLink,
);

/** POST /v1/internal/privacy/purge (x-cron-token) — retention job. */
export const privacyInternalRouter = Router();
privacyInternalRouter.post("/purge", PrivacyController.purge);
