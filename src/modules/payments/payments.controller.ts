import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { PaymentsService } from "./payments.service.js";
import { getObjectStorage } from "../../services/local-object-storage.js";

/**
 * Customer self-serve payment (plan selection, UPI QR, proof upload) was removed:
 * Ekotsa does not sell or disclose prices through the website. Only admin review of
 * existing payment records remains.
 */

const verifySchema = Joi.object({
  paymentId: Joi.string().required(),
  approve: Joi.boolean().required(),
  adminNote: Joi.string().max(1000).optional(),
  durationDays: Joi.number().integer().min(1).max(3650).optional(),
  deviceId: Joi.string().max(120).optional(),
});

const listSchema = Joi.object({
  status: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(200).default(50),
});

const noteSchema = Joi.object({
  paymentId: Joi.string().required(),
  note: Joi.string().min(1).max(2000).required(),
});

export const PaymentsController = {
  async readProof(req: Request, res: Response, next: NextFunction) {
    try {
      const bucket = decodeURIComponent(String(req.params.bucket));
      const path = decodeURIComponent(String(req.params.path));
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      await PaymentsService.assertProofAccess({
        userId: req.userSession.userId,
        role: req.userSession.role,
        bucket,
        path,
      });
      const obj = await getObjectStorage().readObject({ bucket, path });
      if (!obj?.bytes) {
        throw new AppError(404, "Proof not found", "PROOF_NOT_FOUND");
      }
      const safeContentType = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(obj.contentType)
        ? obj.contentType
        : "application/octet-stream";
      res.setHeader("content-type", safeContentType);
      res.setHeader("content-disposition", "attachment");
      res.setHeader("x-content-type-options", "nosniff");
      res.send(obj.bytes);
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = validateOrThrow(listSchema, req.query);
      const result = await PaymentsService.list(query);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async verify(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(verifySchema, req.body);
      const result = await PaymentsService.verify(body);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async note(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(noteSchema, req.body);
      const result = await PaymentsService.updateNote(body);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
