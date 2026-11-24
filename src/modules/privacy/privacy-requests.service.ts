import crypto from "node:crypto";
import { Op } from "sequelize";
import { loadEnv } from "../../config/env.js";
import { AuditLog, PrivacyRequest } from "../../db/models/index.js";
import type { PrivacyRequestStatus, PrivacyRequestType } from "../../db/models/PrivacyRequest.js";
import { AppError } from "../../middleware/errorHandler.js";
import { sendEmail } from "../../services/mailer.js";

/** Response window the team commits to (configurable: PRIVACY_RESPONSE_DAYS, default 30). */
export const RESPONSE_DAYS = Math.max(1, Number(process.env.PRIVACY_RESPONSE_DAYS) || 30);
/** Unconfirmed requests are discarded after this many days. */
export const VERIFY_DAYS = 7;

const GRIEVANCE_SIGNATURE = "Laya Priyadarshani (Owner), Grievance Officer, Ekotsa · admin@ekotsa.com · +91 8544260088";

export const REQUEST_TYPE_LABELS: Record<PrivacyRequestType, string> = {
  ACCESS: "Access a summary of my personal data",
  CORRECTION: "Correct, complete or update my personal data",
  ERASURE: "Erase my personal data / delete my account",
  WITHDRAW_CONSENT: "Withdraw my consent",
  NOMINATION: "Nominate someone to exercise my rights",
  GRIEVANCE: "Make a privacy complaint (grievance)",
  OTHER: "Other privacy question",
};

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("base64url");
const days = (n: number) => n * 86_400_000;

function newReference() {
  return `PR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function safeSend(input: { to: string; subject: string; text: string }) {
  try {
    await sendEmail({ ...input, html: input.text.split("\n").map((l) => `<p>${escapeHtml(l) || "&nbsp;"}</p>`).join("") });
    return true;
  } catch (error) {
    console.error("[privacy-requests] email failed", error);
    return false;
  }
}

export type PublicPrivacyRequest = {
  id: string;
  reference: string;
  type: PrivacyRequestType;
  typeLabel: string;
  requesterRole: string;
  name: string;
  email: string;
  phone: string | null;
  details: string;
  status: PrivacyRequestStatus;
  verifiedAt: string | null;
  dueAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  overdue: boolean;
  assignedToAdminId: string | null;
  scope: string | null;
  exemptionNote: string | null;
  verifiedVia: string | null;
  createdAt: string;
};

function toPublic(r: PrivacyRequest): PublicPrivacyRequest {
  const open = r.status === "RECEIVED" || r.status === "IN_PROGRESS";
  return {
    id: r.id,
    reference: r.reference,
    type: r.type,
    typeLabel: REQUEST_TYPE_LABELS[r.type] ?? r.type,
    requesterRole: r.requesterRole,
    name: r.name,
    email: r.email,
    phone: r.phone,
    details: r.details,
    status: r.status,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    dueAt: r.dueAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolutionNote: r.resolutionNote,
    overdue: Boolean(open && r.dueAt && r.dueAt.getTime() < Date.now()),
    assignedToAdminId: r.assignedToAdminId,
    scope: r.scope,
    exemptionNote: r.exemptionNote,
    verifiedVia: r.verifiedVia,
    createdAt: r.createdAt.toISOString(),
  };
}

export const PrivacyRequestsService = {
  /** Public submission. Sends an immediate acknowledgement with a confirmation link (identity check). */
  async submit(input: {
    type: PrivacyRequestType;
    requesterRole: string;
    name: string;
    email: string;
    phone?: string | null;
    details: string;
    /** Email of the signed-in user, if any: a matching address counts as verified. */
    sessionEmail?: string | null;
  }) {
    const env = loadEnv();
    const email = input.email.trim().toLowerCase();
    if (input.sessionEmail && input.sessionEmail.trim().toLowerCase() === email) {
      const now = new Date();
      const request = await PrivacyRequest.create({
        reference: newReference(),
        type: input.type,
        requesterRole: input.requesterRole,
        name: input.name.trim(),
        email,
        phone: input.phone?.trim() || null,
        details: input.details.trim(),
        status: "RECEIVED",
        verifiedAt: now,
        verifiedVia: "SESSION",
        acknowledgedAt: now,
        dueAt: new Date(now.getTime() + days(RESPONSE_DAYS)),
      });
      await PrivacyRequestsService.notifyOfficer(request);
      await safeSend({
        to: request.email,
        subject: `Ekotsa privacy request ${request.reference} received`,
        text: [
          `Dear ${request.name},`,
          "",
          `We have received your request (${REQUEST_TYPE_LABELS[request.type]}). Your reference is ${request.reference}.`,
          `We will respond by ${request.dueAt!.toDateString()}.`,
          "",
          GRIEVANCE_SIGNATURE,
        ].join("\n"),
      });
      return { reference: request.reference, verified: true, dueAt: request.dueAt!.toISOString() };
    }
    const token = crypto.randomBytes(32).toString("base64url");
    const request = await PrivacyRequest.create({
      reference: newReference(),
      type: input.type,
      requesterRole: input.requesterRole,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      details: input.details.trim(),
      status: "PENDING_VERIFICATION",
      verifyTokenHash: sha256(token),
      acknowledgedAt: new Date(),
    });
    const link = new URL("/privacy-request/confirm", env.FRONTEND_URL);
    link.searchParams.set("token", token);
    await safeSend({
      to: request.email,
      subject: `Ekotsa privacy request ${request.reference} received — please confirm`,
      text: [
        `Dear ${request.name},`,
        "",
        `We have received your request (${REQUEST_TYPE_LABELS[request.type]}). Your reference is ${request.reference}.`,
        "",
        "To protect your data, please confirm that this request came from you by opening this link",
        `within ${VERIFY_DAYS} days:`,
        link.toString(),
        "",
        `Once confirmed, we will respond within ${RESPONSE_DAYS} days. If you did not make this request, ignore this email`,
        "and it will be discarded.",
        "",
        GRIEVANCE_SIGNATURE,
      ].join("\n"),
    });
    return { reference: request.reference, verified: false };
  },

  async notifyOfficer(request: PrivacyRequest) {
    const env = loadEnv();
    if (!env.SMTP_TO) return;
    await safeSend({
      to: env.SMTP_TO,
      subject: `[Privacy] New ${request.type} request ${request.reference} — due ${request.dueAt!.toDateString()}`,
      text: [
        `Reference: ${request.reference}`,
        `Type: ${REQUEST_TYPE_LABELS[request.type]}`,
        `From: ${request.name} <${request.email}>${request.phone ? `, ${request.phone}` : ""} (${request.requesterRole})`,
        `Identity: ${request.verifiedVia === "SESSION" ? "signed-in account" : "email link confirmed"}`,
        `Due by: ${request.dueAt!.toISOString()}`,
        "",
        request.details,
        "",
        "Handle it in the admin panel → Privacy requests.",
      ].join("\n"),
    });
  },

  async verify(token: string) {
    const request = await PrivacyRequest.findOne({ where: { verifyTokenHash: sha256(token) } });
    if (!request || request.status !== "PENDING_VERIFICATION") {
      throw new AppError(404, "This confirmation link is invalid or has already been used.", "PRIVACY_REQUEST_TOKEN_INVALID");
    }
    if (request.createdAt.getTime() + days(VERIFY_DAYS) < Date.now()) {
      throw new AppError(410, "This confirmation link has expired. Please submit the request again.", "PRIVACY_REQUEST_TOKEN_EXPIRED");
    }
    const now = new Date();
    await request.update({
      status: "RECEIVED",
      verifiedAt: now,
      verifiedVia: "EMAIL_LINK",
      verifyTokenHash: null,
      dueAt: new Date(now.getTime() + days(RESPONSE_DAYS)),
    });
    await PrivacyRequestsService.notifyOfficer(request);
    return { reference: request.reference, dueAt: request.dueAt!.toISOString() };
  },

  async list(input: { status?: string }) {
    const where = input.status ? { status: input.status } : { status: { [Op.ne]: "PENDING_VERIFICATION" } };
    const rows = await PrivacyRequest.findAll({ where, order: [["createdAt", "DESC"]], limit: 300 });
    return { requests: rows.map(toPublic) };
  },

  async update(input: {
    id: string;
    status: "IN_PROGRESS" | "RESOLVED" | "REJECTED";
    resolutionNote?: string | null;
    scope?: string | null;
    exemptionNote?: string | null;
    assignToMe?: boolean;
    adminUserId: string;
    adminEmail: string;
  }) {
    const request = await PrivacyRequest.findByPk(input.id);
    if (!request || request.status === "PENDING_VERIFICATION") {
      throw new AppError(404, "Privacy request not found", "NOT_FOUND");
    }
    const closing = input.status === "RESOLVED" || input.status === "REJECTED";
    if (closing && !input.resolutionNote?.trim()) {
      throw new AppError(400, "Add a note explaining the outcome; it is sent to the requester.", "VALIDATION_ERROR");
    }
    await request.update({
      status: input.status,
      resolutionNote: input.resolutionNote?.trim() || request.resolutionNote,
      resolvedAt: closing ? new Date() : null,
      handledByAdminId: input.adminUserId,
      scope: input.scope?.trim() || request.scope,
      exemptionNote: input.exemptionNote?.trim() || request.exemptionNote,
      assignedToAdminId: input.assignToMe || !request.assignedToAdminId ? input.adminUserId : request.assignedToAdminId,
    });
    await AuditLog.create({
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      event: `privacy_request.${input.status.toLowerCase()}`,
      targetType: "privacy_request",
      targetId: request.id,
      metaJson: JSON.stringify({ reference: request.reference, type: request.type }),
    }).catch(() => undefined);

    if (closing) {
      await safeSend({
        to: request.email,
        subject: `Ekotsa privacy request ${request.reference}: ${input.status === "RESOLVED" ? "completed" : "decision"}`,
        text: [
          `Dear ${request.name},`,
          "",
          `Your request ${request.reference} (${REQUEST_TYPE_LABELS[request.type]}) has been ${input.status === "RESOLVED" ? "completed" : "declined"}.`,
          "",
          request.resolutionNote ?? "",
          "",
          "If you are not satisfied with this response, you may reply to this email, and you may also complain to the",
          "Data Protection Board of India (and, if the GDPR applies to you, to your data protection authority).",
          "",
          GRIEVANCE_SIGNATURE,
        ].join("\n"),
      });
    }
    return { request: toPublic(request) };
  },

  /** Daily: discard unconfirmed requests and email the Grievance Officer a digest of due/overdue items. */
  async dailyMaintenance(dryRun = false) {
    const staleWhere = {
      status: "PENDING_VERIFICATION",
      createdAt: { [Op.lt]: new Date(Date.now() - days(VERIFY_DAYS)) },
    };
    const discarded = dryRun
      ? await PrivacyRequest.count({ where: staleWhere })
      : await PrivacyRequest.destroy({ where: staleWhere });

    const open = await PrivacyRequest.findAll({
      where: {
        status: { [Op.in]: ["RECEIVED", "IN_PROGRESS"] },
        dueAt: { [Op.lt]: new Date(Date.now() + days(7)) },
      },
      order: [["dueAt", "ASC"]],
    });
    const env = loadEnv();
    let digestSent = false;
    if (open.length && env.SMTP_TO && !dryRun) {
      digestSent = await safeSend({
        to: env.SMTP_TO,
        subject: `[Privacy] ${open.length} request(s) due within 7 days or overdue`,
        text: open
          .map((r) => `${r.reference} · ${r.type} · ${r.email} · due ${r.dueAt!.toDateString()}${r.dueAt!.getTime() < Date.now() ? " · OVERDUE" : ""}`)
          .concat(["", "Handle them in the admin panel → Privacy requests."])
          .join("\n"),
      });
    }
    return { unconfirmedDiscarded: discarded, dueSoonOrOverdue: open.length, digestSent };
  },
};
