import { Router } from "express";
import { requireUserSession } from "../../middleware/requireUserSession.js";
import { PaymentsController } from "./payments.controller.js";

/**
 * Payments — admin review of existing records only.
 * Customer self-serve purchase (QR, submit, confirm, proof upload) was removed:
 * no direct sales or price disclosure through the website.
 *
 * GET  /v1/payments/proof/:bucket/:path   (owning user or admin)
 */
export const paymentsRouter = Router();

paymentsRouter.get("/proof/:bucket/:path", requireUserSession, PaymentsController.readProof);
