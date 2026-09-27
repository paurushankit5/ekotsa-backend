import type { NextFunction, Request, Response } from "express";
import { HealthService } from "./health.service.js";

export const HealthController = {
  async get(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await HealthService.check();
      res.json({ ok: true, data });
    } catch (error) {
      next(error);
    }
  },
};
