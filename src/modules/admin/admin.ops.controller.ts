import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { AdminOpsService } from "./admin.ops.service.js";
import { DeviceResetService } from "../devices/device-reset.service.js";

const decideSchema = Joi.object({
  requestId: Joi.string().required(),
  action: Joi.string().valid("approve", "reject").required(),
  note: Joi.string().max(2000).allow("", null).optional(),
});

const resetRequestSchema = Joi.object({
  deviceId: Joi.string().max(120).allow("", null).optional(),
  reason: Joi.string().max(500).allow("", null).optional(),
});

export const AdminOpsController = {
  async users(req: Request, res: Response, next: NextFunction) {
    try {
      const take = req.query.take ? Number(req.query.take) : 100;
      const skip = req.query.skip ? Number(req.query.skip) : 0;
      const result = await AdminOpsService.listUsers({ take, skip });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async customersSearch(req: Request, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || "");
      const take = req.query.take ? Number(req.query.take) : 50;
      const skip = req.query.skip ? Number(req.query.skip) : 0;
      const result = await AdminOpsService.searchCustomers({ q, take, skip });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async activeUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const take = req.query.take ? Number(req.query.take) : 50;
      const skip = req.query.skip ? Number(req.query.skip) : 0;
      const result = await AdminOpsService.activeUsers({ take, skip });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async metrics(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminOpsService.metrics();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async opsSummary(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminOpsService.opsSummary();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async leads(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AdminOpsService.listLeads();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async abuseTrials(req: Request, res: Response, next: NextFunction) {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const result = await AdminOpsService.abuseTrials({ days });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async supportTimeline(req: Request, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || "");
      const result = await AdminOpsService.supportTimeline({ q });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async export(req: Request, res: Response, next: NextFunction) {
    try {
      const kind = String(req.params.kind) as
        | "recoveries"
        | "audit"
        | "payments"
        | "licenses";
      if (!["recoveries", "audit", "payments", "licenses"].includes(kind)) {
        throw new AppError(404, "Export not found", "EXPORT_NOT_FOUND");
      }
      const result = await AdminOpsService.exportCsv(kind);
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader(
        "content-disposition",
        `attachment; filename="${result.filename}"`,
      );
      res.send(result.csv);
    } catch (error) {
      next(error);
    }
  },

  async listDeviceResets(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const result = await DeviceResetService.listAdmin({ status });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async decideDeviceReset(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(decideSchema, req.body);
      const result = await DeviceResetService.decide({
        requestId: body.requestId,
        action: body.action,
        note: body.note,
        adminUserId: req.userSession.userId,
        adminEmail: req.userSession.email,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};

export const DeviceResetController = {
  async request(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
      const body = validateOrThrow(resetRequestSchema, req.body ?? {});
      const result = await DeviceResetService.createRequest({
        userId: req.userSession.userId,
        email: req.userSession.email,
        deviceId: body.deviceId,
        reason: body.reason,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
