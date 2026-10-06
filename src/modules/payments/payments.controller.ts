import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { PaymentsService } from "./payments.service.js";
import { getObjectStorage } from "../../services/local-object-storage.js";

const startSchema = Joi.object({
  plan: Joi.string().min(1).max(80).default("standard"),
  referenceId: Joi.string().max(120).optional(),
  deviceId: Joi.string().max(120).optional(),
  contentType: Joi.string().max(120).default("image/jpeg"),
  size: Joi.number().integer().min(1).max(10_000_000).default(1_000_000),
});

const confirmSchema = Joi.object({
  paymentId: Joi.string().required(),
});

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
  async qr(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ ok: true, paymentQr: PaymentsService.getQr() });
    } catch (error) {
      next(error);
    }
  },

  async submit(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(startSchema, req.body);
      const result = await PaymentsService.startSubmission({
        userId: req.userSession.userId,
        ...body,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async confirm(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(confirmSchema, req.body);
      const result = await PaymentsService.confirm({
        userId: req.userSession.userId,
        paymentId: body.paymentId,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async uploadProof(req: Request, res: Response, next: NextFunction) {
    try {
      const bucket = decodeURIComponent(String(req.params.bucket));
      const path = decodeURIComponent(String(req.params.path));
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks);
      if (body.length === 0) {
        throw new AppError(400, "Empty upload body", "EMPTY_UPLOAD");
      }
      await getObjectStorage().putObject({
        bucket,
        path,
        contentType: String(req.headers["content-type"] || "application/octet-stream"),
        body,
      });
      res.json({ ok: true, uploaded: true, size: body.length });
    } catch (error) {
      next(error);
    }
  },

  async readProof(req: Request, res: Response, next: NextFunction) {
    try {
      const bucket = decodeURIComponent(String(req.params.bucket));
      const path = decodeURIComponent(String(req.params.path));
      const obj = await getObjectStorage().readObject({ bucket, path });
      if (!obj?.bytes) {
        throw new AppError(404, "Proof not found", "PROOF_NOT_FOUND");
      }
      res.setHeader("content-type", obj.contentType);
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
