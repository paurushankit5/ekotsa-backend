import { Router } from "express";
import { ReleasesController } from "./releases.controller.js";

/** GET /v1/releases/current?platform=windows|macos|linux */
export const releasesRouter = Router();
releasesRouter.get("/current", ReleasesController.current);
