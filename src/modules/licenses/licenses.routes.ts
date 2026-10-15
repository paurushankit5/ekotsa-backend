import { Router } from "express";
import { requireDeviceAuth } from "../devices/devices.auth.js";
import { LicenseController } from "./licenses.controller.js";

/**
 * Desktop license APIs (Atithi-compatible)
 * POST /v1/licenses/issue
 * GET  /v1/licenses/status
 * POST /v1/licenses/refresh
 *
 * All require Authorization: Bearer <deviceAuthToken>
 */
export const licensesRouter = Router();

licensesRouter.post("/issue", requireDeviceAuth, LicenseController.issue);
licensesRouter.get("/status", requireDeviceAuth, LicenseController.status);
licensesRouter.post("/refresh", requireDeviceAuth, LicenseController.refresh);
