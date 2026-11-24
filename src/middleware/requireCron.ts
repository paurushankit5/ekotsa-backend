import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { loadEnv } from "../config/env.js";
import { AppError } from "./errorHandler.js";

/**
 * Guard for scheduled-job endpoints (/v1/internal/*). The scheduler sends the shared
 * CRON_SECRET in the `x-cron-token` header; compared in constant time.
 */
export function requireCron(req: Request): void {
  const expected = loadEnv().CRON_SECRET;
  if (!expected) {
    throw new AppError(503, "CRON_SECRET not configured", "CRON_NOT_CONFIGURED");
  }
  const token = req.header("x-cron-token") ?? "";
  // Hash both sides so lengths match and timingSafeEqual never throws.
  const a = createHash("sha256").update(token).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!token || !timingSafeEqual(a, b)) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }
}
