import { Joi } from "../../utils/validate.js";
import type { AgeCategory } from "../../db/models/ConsentRecord.js";

/** Version of the public Terms of Use; recorded separately from privacy consent. */
export const TERMS_VERSION = "2026-11-25";

export type GuardianInput = {
  name: string;
  email: string;
  relationship: "PARENT" | "LEGAL_GUARDIAN";
  declaration: true;
};

export type PrivacyInput = {
  ageCategory: AgeCategory;
  guardian?: GuardianInput;
  /** Version of the point-of-collection notice the user was shown (see notices.ts). */
  noticeVersion?: string;
  marketingConsent?: boolean;
};

const guardianSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(254).required(),
  relationship: Joi.string().valid("PARENT", "LEGAL_GUARDIAN").required(),
  // Declaration by the child that the guardian agreed to be contacted. The guardian still has to
  // approve by email and Ekotsa staff must verify the guardian's identity before anything is activated.
  declaration: Joi.boolean().valid(true).required(),
});

/** Spread into any public form schema that collects personal data. */
export const privacyFields = {
  ageCategory: Joi.string().valid("ADULT", "MINOR").required().messages({
    "any.required": "Please confirm whether you are 18 or older.",
  }),
  guardian: Joi.when("ageCategory", {
    is: "MINOR",
    then: guardianSchema.required().messages({
      "any.required": "Parent or guardian details are required for users under 18.",
    }),
    otherwise: Joi.any().strip(),
  }),
  noticeVersion: Joi.string().max(40).required().messages({
    "any.required": "Please reload the page to see the current privacy notice.",
  }),
  marketingConsent: Joi.boolean().optional(),
};

export const ageUpdateSchema = Joi.object({
  ...privacyFields,
  consent: Joi.boolean().valid(true).required().messages({
    "any.only": "Please agree to Ekotsa using your details as described in the notice.",
    "any.required": "Please agree to Ekotsa using your details as described in the notice.",
  }),
  termsAccepted: Joi.boolean().valid(true).required().messages({
    "any.only": "Please accept the Terms of Use to continue.",
    "any.required": "Please accept the Terms of Use to continue.",
  }),
});

export const guardianTokenSchema = Joi.object({
  token: Joi.string().trim().min(20).max(200).required(),
});

export const guardianDecisionSchema = Joi.object({
  token: Joi.string().trim().min(20).max(200).required(),
  decision: Joi.string().valid("APPROVE", "DECLINE").required(),
  // Guardian confirms they are an adult and the child's parent/lawful guardian, and accepts the
  // Terms of Use on the child's behalf.
  guardianDeclaration: Joi.when("decision", {
    is: "APPROVE",
    then: Joi.boolean().valid(true).required(),
    otherwise: Joi.any().strip(),
  }),
});

export const guardianVerificationSchema = Joi.object({
  decision: Joi.string().valid("VERIFIED", "REJECTED").required(),
  method: Joi.when("decision", {
    is: "VERIFIED",
    then: Joi.string().valid("VIDEO_CALL_ID_CHECK", "IN_PERSON_ID_CHECK", "DIGILOCKER", "OTHER").required(),
    otherwise: Joi.string().optional(),
  }),
  note: Joi.string().trim().min(5).max(2000).required().messages({
    "any.required": "Record how the guardian was verified (no ID numbers or copies).",
  }),
});
