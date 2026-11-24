import { Router } from "express";
import { ContactController } from "./contact.controller.js";
import { rateLimit } from "../../middleware/rateLimit.js";

/**
 * Wave F — contact + business assessment
 * Mounted at root of /v1 so paths match website:
 * POST /v1/contact
 * POST /v1/business-assessment
 */
export const contactRouter = Router();

contactRouter.post("/", rateLimit({ keyPrefix: "contact", windowMs: 60_000, max: 10 }), ContactController.contact);
contactRouter.post("/business-assessment", rateLimit({ keyPrefix: "business-assessment", windowMs: 60_000, max: 10 }), ContactController.businessAssessment);
