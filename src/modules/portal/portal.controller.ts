import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../middleware/errorHandler.js";
import { PortalService } from "./portal.service.js";

export const PortalController = {
  async overview(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await PortalService.overview(req.userSession.userId);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async deviceResets(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await PortalService.deviceResets(req.userSession.userId);
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async downloadRecovery(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const result = await PortalService.downloadRecovery(
        req.userSession.userId,
        String(req.params.id),
      );
      res.setHeader("content-type", "application/json");
      res.setHeader(
        "content-disposition",
        `attachment; filename="${result.filename}"`,
      );
      res.send(result.artifactJson);
    } catch (error) {
      next(error);
    }
  },
};
