import { Router } from "express";
import { requireUserSession } from "../../middleware/requireUserSession.js";
import { PaymentsController } from "./payments.controller.js";

/**
 * Wave D — payments
 * GET  /v1/payment-qr                 (alias via mount)
 * POST /v1/submit-payment
 * POST /v1/submit-payment/confirm
 * PUT  /v1/payments/upload/:bucket/:path
 * GET  /v1/payments/proof/:bucket/:path
 */
export const paymentsRouter = Router();

paymentsRouter.get("/qr", PaymentsController.qr);
paymentsRouter.post("/submit", requireUserSession, PaymentsController.submit);
paymentsRouter.post("/submit/confirm", requireUserSession, PaymentsController.confirm);
paymentsRouter.put("/upload/:bucket/:path", PaymentsController.uploadProof);
paymentsRouter.get("/proof/:bucket/:path", PaymentsController.readProof);
