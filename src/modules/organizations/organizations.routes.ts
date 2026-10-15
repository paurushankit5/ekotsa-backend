import { Router } from "express";
import { OrganizationsController } from "../registrations/registrations.controller.js";

/** GET /v1/organizations/:id */
export const organizationsRouter = Router();
organizationsRouter.get("/:id", OrganizationsController.getById);
