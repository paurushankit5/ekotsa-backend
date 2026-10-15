import { Router } from "express";
import { requireDeviceAuth } from "./devices.auth.js";
import { DeviceController } from "./devices.controller.js";

/**
 * Device identity for Atithi
 * POST /v1/devices/register  — activation session → device auth Bearer token
 * GET  /v1/devices/me        — Bearer device auth
 * POST /v1/devices/revoke    — revoke this device + tokens
 */
export const devicesRouter = Router();

devicesRouter.post("/register", DeviceController.register);
devicesRouter.get("/me", requireDeviceAuth, DeviceController.me);
devicesRouter.post("/revoke", requireDeviceAuth, DeviceController.revoke);
