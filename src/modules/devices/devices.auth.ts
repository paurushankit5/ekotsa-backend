import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../middleware/errorHandler.js";
import { Device, DeviceAuthToken } from "../../db/models/index.js";
import { hashDeviceAuthToken } from "./devices.crypto.js";

export type DeviceAuthContext = {
  deviceId: string;
  userId: string;
  tokenId: string;
};

declare global {
  namespace Express {
    interface Request {
      deviceAuth?: DeviceAuthContext;
    }
  }
}

export async function requireDeviceAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    if (!token) {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }

    const tokenHash = hashDeviceAuthToken(token);
    const record = await DeviceAuthToken.findOne({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }

    const device = await Device.findByPk(record.deviceId);
    if (!device || device.status !== "ACTIVE") {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }

    req.deviceAuth = {
      deviceId: device.id,
      userId: device.userId,
      tokenId: record.id,
    };
    next();
  } catch (error) {
    next(error);
  }
}
