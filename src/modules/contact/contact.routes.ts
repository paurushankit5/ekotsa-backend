import { Router } from "express";
import { ContactController } from "./contact.controller.js";

/**
 * Wave F — contact + business assessment
 * Mounted at root of /v1 so paths match website:
 * POST /v1/contact
 * POST /v1/business-assessment
 */
export const contactRouter = Router();

contactRouter.post("/", ContactController.contact);
contactRouter.post("/business-assessment", ContactController.businessAssessment);
