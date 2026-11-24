import { AppError } from "../../middleware/errorHandler.js";

/**
 * Point-of-collection privacy notices (one per form / optional purpose).
 * Each is versioned: the website shows the current version and sends it back with the submission,
 * and the version is stored with the consent record. Change the text → bump `version`.
 * Keep wording factual: describe what the code actually does; no statements of legal compliance.
 */

export const OPERATOR = {
  name: "Laya Priyadarshani",
  tradingAs: "Ekotsa",
  address: "A.A. Nilyam, Shivpuri, Patna 800023, Bihar, India",
  email: "admin@ekotsa.com",
  phone: "+91 8544260088",
  grievanceOfficer: "Laya Priyadarshani (Owner)",
} as const;

export type NoticeItem = { data: string; purpose: string; required: boolean; retention: string };
export type Notice = {
  key: NoticeKey;
  version: string;
  effectiveFrom: string;
  title: string;
  optional: boolean;
  summary: string;
  items: NoticeItem[];
  recipients: string;
  choices: string;
};

export const NOTICE_KEYS = [
  "signup",
  "google_signup",
  "contact",
  "assessment",
  "download",
  "privacy_request",
  "guardian",
  "analytics",
  "marketing_email",
] as const;
export type NoticeKey = (typeof NOTICE_KEYS)[number];

const V = "2026-11-25";
const SECURITY_ITEM: NoticeItem = {
  data: "IP address and browser details of the request",
  purpose: "Security, abuse prevention and rate limiting",
  required: true,
  retention: "Security logs 2 years; rate-limit counters about 1 hour",
};
const AGE_ITEM: NoticeItem = {
  data: "Whether you are 18 or older or under 18",
  purpose: "To know whether a parent or legal guardian must approve before we use your details",
  required: true,
  retention: "Kept with the record it relates to",
};
const PROOF_ITEM: NoticeItem = {
  data: "Which notice you saw, your choices, the time, and a hashed IP address",
  purpose: "To keep proof of what you agreed to",
  required: true,
  retention: "As long as the related data, plus 3 years",
};
const HOSTING =
  "Stored in our database (Neon, Singapore) and handled by our hosting providers (Vercel, India; Render, Singapore) on our behalf. Emails are sent through Google Workspace. We do not sell your data.";
const WITHDRAW =
  "You can ask us to stop using these details, correct them or delete them at any time through the privacy request form (www.ekotsa.com/privacy-request) or by writing to admin@ekotsa.com.";

const NOTICES: Record<NoticeKey, Notice> = {
  signup: {
    key: "signup",
    version: V,
    effectiveFrom: V,
    title: "Creating an Ekotsa account",
    optional: false,
    summary: "We use these details to create and secure your account and to provide your trial or licence.",
    items: [
      { data: "Email address", purpose: "Your sign-in name, account and licence messages", required: true, retention: "While your account is active (see Privacy Policy, retention)" },
      { data: "Password", purpose: "Sign-in. Stored only as a salted one-way hash, never readable", required: true, retention: "While your account is active" },
      { data: "Name", purpose: "Addressing you in messages", required: false, retention: "While your account is active" },
      AGE_ITEM,
      SECURITY_ITEM,
      PROOF_ITEM,
    ],
    recipients: HOSTING,
    choices: `Product update emails are a separate optional choice. ${WITHDRAW}`,
  },
  google_signup: {
    key: "google_signup",
    version: V,
    effectiveFrom: V,
    title: "Creating an Ekotsa account with Google",
    optional: false,
    summary: "Google shares your name, email and a Google account ID with us. We use them to create and secure your account.",
    items: [
      { data: "Google account ID, name and email address (from Google)", purpose: "Create your account and let you sign in with Google", required: true, retention: "While your account is active" },
      AGE_ITEM,
      SECURITY_ITEM,
      PROOF_ITEM,
    ],
    recipients: `${HOSTING} Google's own privacy policy applies to your Google account.`,
    choices: WITHDRAW,
  },
  contact: {
    key: "contact",
    version: V,
    effectiveFrom: V,
    title: "Contact and demo requests",
    optional: false,
    summary: "We use these details only to answer this enquiry and contact you about it.",
    items: [
      { data: "Name and organisation", purpose: "Know who is asking", required: true, retention: "24 months after our last contact, unless it leads to an agreement" },
      { data: "Phone number", purpose: "Call you about this enquiry", required: true, retention: "24 months after our last contact" },
      { data: "Email address", purpose: "Reply by email", required: false, retention: "24 months after our last contact" },
      { data: "WhatsApp number and whether to use WhatsApp", purpose: "Reply on WhatsApp, only if you ask us to", required: false, retention: "24 months after our last contact" },
      { data: "Enquiry type and message", purpose: "Understand what you need", required: false, retention: "24 months after our last contact" },
      AGE_ITEM,
      SECURITY_ITEM,
      PROOF_ITEM,
    ],
    recipients: `${HOSTING} If you choose WhatsApp, messages pass through WhatsApp (Meta).`,
    choices: `We will not send you marketing because of this enquiry. ${WITHDRAW}`,
  },
  assessment: {
    key: "assessment",
    version: V,
    effectiveFrom: V,
    title: "Business assessment requests",
    optional: false,
    summary: "We use these details only to review your request and contact you about it.",
    items: [
      { data: "Name, organisation, email and phone", purpose: "Know who is asking and reply", required: true, retention: "24 months after our last contact, unless it leads to an agreement" },
      { data: "Business details you describe (industry, locations, systems, needs)", purpose: "Assess what would fit your business", required: true, retention: "24 months after our last contact" },
      AGE_ITEM,
      SECURITY_ITEM,
      PROOF_ITEM,
    ],
    recipients: HOSTING,
    choices: `We will not send you marketing because of this request. ${WITHDRAW}`,
  },
  download: {
    key: "download",
    version: V,
    effectiveFrom: V,
    title: "Registering for the Atithi trial download",
    optional: false,
    summary: "We use these details to give you the installer, link it to your trial or licence, and support you.",
    items: [
      { data: "Name, organisation, email, phone and WhatsApp number", purpose: "Register the download and contact you about setup and support", required: true, retention: "36 months after your last download or activation; longer if it becomes a paid licence" },
      { data: "Industry and business address", purpose: "Know which business the trial is for", required: true, retention: "Same as above" },
      { data: "Download history (version, platform, time)", purpose: "Limit and audit installer downloads", required: true, retention: "36 months" },
      AGE_ITEM,
      SECURITY_ITEM,
      PROOF_ITEM,
    ],
    recipients: `${HOSTING} Installer files are delivered from Cloudflare R2.`,
    choices: `Product update emails are a separate optional choice below. ${WITHDRAW}`,
  },
  privacy_request: {
    key: "privacy_request",
    version: V,
    effectiveFrom: V,
    title: "Privacy requests and grievances",
    optional: false,
    summary: "We use these details only to verify your identity and handle your request.",
    items: [
      { data: "Name, email, phone (optional) and whom you act for", purpose: "Verify the request and reply to you", required: true, retention: "3 years after the request is closed; unconfirmed requests 7 days" },
      { data: "Request details", purpose: "Handle the request", required: true, retention: "3 years after the request is closed" },
      SECURITY_ITEM,
    ],
    recipients: HOSTING,
    choices: "You can withdraw the request by replying to our email.",
  },
  guardian: {
    key: "guardian",
    version: V,
    effectiveFrom: V,
    title: "Parent or guardian consent for a person under 18",
    optional: false,
    summary:
      "We ask for the parent or guardian's details so that they can approve or refuse, and we check their identity before anything is activated.",
    items: [
      { data: "Parent or guardian's name, email and relationship", purpose: "Ask for and record their decision", required: true, retention: "Kept with the child's record; deleted with it if they refuse or do not respond" },
      { data: "How we checked the guardian's identity (method, date, reference note; no copies of ID documents)", purpose: "Prove the guardian is an identifiable adult", required: true, retention: "As long as the child's record, plus 3 years" },
    ],
    recipients: HOSTING,
    choices: "The parent or guardian can withdraw consent at any time by writing to admin@ekotsa.com.",
  },
  analytics: {
    key: "analytics",
    version: V,
    effectiveFrom: V,
    title: "Website analytics (optional)",
    optional: true,
    summary: "If you accept, we count how the website is used so that we can improve it. It is off unless you accept.",
    items: [
      { data: "Pages viewed, buttons clicked and form steps (never what you type), referring website domain, a random visit ID", purpose: "Understand and improve the website", required: false, retention: "12 months" },
    ],
    recipients: "Processed by PostHog on its EU servers, with session recording, autocapture and IP addresses switched off. Never used for advertising.",
    choices: "Change your choice at any time under Privacy preferences in the website footer.",
  },
  marketing_email: {
    key: "marketing_email",
    version: V,
    effectiveFrom: V,
    title: "Product update emails (optional)",
    optional: true,
    summary: "If you opt in, we may email you occasional news about Ekotsa products. Never sent to anyone under 18.",
    items: [
      { data: "Email address and name", purpose: "Send product update emails", required: false, retention: "Until you unsubscribe; we then keep your email on a do-not-contact list so that we never email you again" },
    ],
    recipients: "Sent through Google Workspace from admin@ekotsa.com.",
    choices: "Every email has an unsubscribe link that works immediately without signing in. Account and security emails are separate and not affected.",
  },
};

export function getNotice(key: NoticeKey): Notice {
  return NOTICES[key];
}

export function getNotices(keys?: string[]) {
  const wanted = (keys?.length ? keys : NOTICE_KEYS).filter((k): k is NoticeKey => (NOTICE_KEYS as readonly string[]).includes(k));
  return { operator: OPERATOR, notices: wanted.map((k) => NOTICES[k]) };
}

/** The submitted notice version must be the one currently shown; otherwise the user saw stale text. */
export function assertCurrentNotice(key: NoticeKey, version: string | undefined | null) {
  const notice = NOTICES[key];
  if (!version || version !== notice.version) {
    throw new AppError(
      409,
      "The privacy notice for this form has been updated. Please reload the page, review it and submit again.",
      "NOTICE_OUTDATED",
    );
  }
  return notice;
}
