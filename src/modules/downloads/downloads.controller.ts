import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { DownloadsService } from "./downloads.service.js";

const sessionSchema = Joi.object({
  platform: Joi.string().valid("windows", "macos", "linux", "*").optional(),
  productCode: Joi.string().max(80).optional(),
});

const authorizeSchema = Joi.object({
  platform: Joi.string().valid("windows", "macos", "linux").required(),
  installerVersion: Joi.string().max(120).allow(null).optional(),
  token: Joi.string().min(20).max(500).optional(),
  mode: Joi.string().valid("json", "redirect").default("json"),
});

const eventSchema = Joi.object({
  registrationId: Joi.string().allow(null).optional(),
  userId: Joi.string().allow(null).optional(),
  productCode: Joi.string().max(80).allow(null).optional(),
  installerVersion: Joi.string().max(40).allow(null).optional(),
  platform: Joi.string().max(40).allow(null).optional(),
  architecture: Joi.string().max(40).allow(null).optional(),
  sourcePage: Joi.string().max(200).allow(null).optional(),
  correlationId: Joi.string().max(120).allow(null).optional(),
});

export const DownloadsController = {
  async createSession(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(sessionSchema, req.body ?? {});
      const result = await DownloadsService.createSession({
        userId: req.userSession.userId,
        platform: body.platform,
        productCode: body.productCode,
      });
      res.status(201).json({ ok: true, downloadAuth: result });
    } catch (error) {
      next(error);
    }
  },

  async authorize(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(authorizeSchema, req.body);
      const header = req.headers.authorization ?? "";
      const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
      const cookieToken =
        typeof req.cookies?.ek_download_session === "string"
          ? req.cookies.ek_download_session
          : undefined;
      const token = body.token || bearer || cookieToken;
      if (!token) {
        throw new AppError(401, "Registration is required before downloading", "DOWNLOAD_UNAUTHORIZED");
      }

      const result = await DownloadsService.authorize({
        token,
        platform: body.platform,
        installerVersion: body.installerVersion,
      });

      if (body.mode === "redirect") {
        res.redirect(302, result.download.url);
        return;
      }
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async record(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(eventSchema, req.body ?? {});
      const result = await DownloadsService.recordEvent(body);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
