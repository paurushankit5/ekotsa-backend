import { Router } from "express";
import {
  optionalUserSession,
  requireUserSession,
} from "../../middleware/requireUserSession.js";
import { RegistrationsController } from "./registrations.controller.js";
import { rateLimit } from "../../middleware/rateLimit.js";

/**
 * Wave D — registrations
 * POST /v1/registrations
 * GET  /v1/registrations/status?email=|&registrationId=
 * GET  /v1/registrations/me  (cookie)
 */
export const registrationsRouter = Router();

registrationsRouter.post("/", rateLimit({ keyPrefix: "registration-create", windowMs: 60_000, max: 10 }), optionalUserSession, RegistrationsController.create);
registrationsRouter.get("/status", optionalUserSession, RegistrationsController.status);
registrationsRouter.get("/me", requireUserSession, RegistrationsController.me);
