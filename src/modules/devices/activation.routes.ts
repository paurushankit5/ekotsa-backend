import { Router } from "express";
import { requireUserSession } from "../../middleware/requireUserSession.js";
import { DeviceController } from "../devices/devices.controller.js";

/**
 * One-time activation session for desktop device registration.
 * POST /v1/activation/session  (requires user cookie session)
 */
export const activationRouter = Router();

activationRouter.post("/session", requireUserSession, DeviceController.createActivationSession);
