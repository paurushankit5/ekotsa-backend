import crypto from "node:crypto";
import { Op } from "sequelize";
import { getOtpPepper, loadEnv } from "../../config/env.js";
import {
  AuditLog,
  ConsentRecord,
  ContactLead,
  CustomerRegistration,
  DownloadAuthorization,
  DownloadEvent,
  TermsAcceptance,
  User,
  sequelize,
} from "../../db/models/index.js";
import type { ConsentSubjectType, GuardianStatus } from "../../db/models/ConsentRecord.js";
import { AppError } from "../../middleware/errorHandler.js";
import { sendEmail } from "../../services/mailer.js";
import { TERMS_VERSION, type PrivacyInput } from "./privacy.schema.js";
import { assertCurrentNotice, getNotice, OPERATOR, type NoticeKey } from "./notices.js";

/** Days a parent/guardian has to respond, and staff have to verify them, before the submission is erased. */
export const GUARDIAN_RESPONSE_DAYS = 7;
export const GUARDIAN_VERIFICATION_DAYS = 7;

const PURPOSE_LABELS: Record<string, string> = {
  account: "create and operate an Ekotsa account",
  enquiry: "respond to an enquiry or demo request",
  assessment: "review a business assessment request",
  download_registration: "register for and download the Ekotsa Atithi trial",
};

const SIGNATURE = `${OPERATOR.grievanceOfficer}, Grievance Officer, ${OPERATOR.tradingAs} · ${OPERATOR.email} · ${OPERATOR.phone}`;

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function hashIp(ip: string | undefined | null) {
  if (!ip) return null;
  return sha256(`${getOtpPepper(loadEnv())}:ip:${ip}`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export type RecordConsentInput = {
  subjectType: ConsentSubjectType;
  subjectId: string;
  noticeKey: NoticeKey;
  email?: string | null;
  childName?: string | null;
  purposes: string[];
  privacy: PrivacyInput;
  /** Record acceptance of the Terms of Use (separately from consent). */
  termsAccepted?: boolean;
  ip?: string | null;
  userAgent?: string | null;
};

export type ConsentStatus = {
  ageCategory: "ADULT" | "MINOR" | null;
  guardianStatus: GuardianStatus | null;
  blocked: boolean;
};

export const TermsService = {
  async record(input: {
    subjectType: string;
    subjectId: string;
    acceptedBy?: "SELF" | "GUARDIAN";
    ip?: string | null;
  }) {
    await TermsAcceptance.create({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      documentKey: "terms_of_use",
      version: TERMS_VERSION,
      acceptedBy: input.acceptedBy ?? "SELF",
      ipHash: hashIp(input.ip),
    });
  },
};

async function sendGuardianRequest(record: ConsentRecord, token: string, childName: string | null) {
  const env = loadEnv();
  const link = new URL("/guardian-consent", env.FRONTEND_URL);
  link.searchParams.set("token", token);
  const purposes = record.purposes.map((p) => PURPOSE_LABELS[p] ?? p);
  const who = childName?.trim() || "A person under 18";
  const lines = [
    `Dear ${record.guardianName},`,
    "",
    `${who} has named you as their parent or legal guardian while submitting details to Ekotsa.`,
    `They asked us to: ${purposes.join("; ")}.`,
    "",
    "We use the personal data of a person under 18 only with the consent of their parent or legal guardian.",
    "Nothing has been processed yet.",
    "",
    `Please review the request and approve or decline here (link valid for ${GUARDIAN_RESPONSE_DAYS} days):`,
    link.toString(),
    "",
    "If you approve, a member of our team will contact you to confirm your identity (for example by a short",
    "video call where you show an ID document; we do not keep a copy). Only then is anything activated.",
    "",
    `If you do not respond within ${GUARDIAN_RESPONSE_DAYS} days, the submission will be deleted.`,
    "If you do not recognise this request, choose Decline or ignore this email.",
    "",
    `Privacy Policy: ${new URL("/privacy-policy", env.FRONTEND_URL).toString()}`,
    SIGNATURE,
  ];
  await sendEmail({
    to: record.guardianEmail!,
    subject: "Ekotsa: parent/guardian consent needed",
    text: lines.join("\n"),
    html: lines
      .map((l) => (l.startsWith("http") ? `<p><a href="${escapeHtml(l)}">${escapeHtml(l)}</a></p>` : `<p>${escapeHtml(l) || "&nbsp;"}</p>`))
      .join(""),
  });
}

/** Erase the personal data behind a consent record (guardian declined, did not respond, or failed verification). */
async function eraseSubject(record: ConsentRecord) {
  await sequelize.transaction(async (transaction) => {
    if (record.subjectType === "CONTACT_LEAD") {
      await ContactLead.destroy({ where: { id: record.subjectId }, transaction });
    } else if (record.subjectType === "REGISTRATION") {
      await DownloadAuthorization.destroy({ where: { registrationId: record.subjectId }, transaction });
      await DownloadEvent.destroy({ where: { registrationId: record.subjectId }, transaction });
      await CustomerRegistration.destroy({ where: { id: record.subjectId }, transaction });
    } else if (record.subjectType === "USER") {
      const user = await User.findByPk(record.subjectId, { transaction });
      if (user && user.role !== "ADMIN") {
        await CustomerRegistration.update({ linkedUserId: null }, { where: { linkedUserId: user.id }, transaction });
        await user.destroy({ transaction });
      }
    }
    // Keep a minimal, de-identified proof of the decision.
    await record.update(
      {
        email: null,
        guardianName: null,
        guardianEmail: null,
        guardianTokenHash: null,
        ipHash: null,
        userAgent: null,
      },
      { transaction },
    );
  });
}

export const PrivacyService = {
  async recordConsent(
    input: RecordConsentInput,
  ): Promise<{ consentId: string; guardianStatus: NonNullable<ConsentStatus["guardianStatus"]> }> {
    const { privacy } = input;
    const notice = assertCurrentNotice(input.noticeKey, privacy.noticeVersion);
    const isMinor = privacy.ageCategory === "MINOR";
    if (isMinor) assertCurrentNotice("guardian", getNotice("guardian").version);

    if (isMinor && privacy.guardian && input.email) {
      if (privacy.guardian.email.trim().toLowerCase() === input.email.trim().toLowerCase()) {
        throw new AppError(400, "The parent or guardian email must be different from your own.", "GUARDIAN_EMAIL_SAME");
      }
    }

    const token = isMinor ? crypto.randomBytes(32).toString("base64url") : null;
    const record = await ConsentRecord.create({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      email: input.email?.trim().toLowerCase() || null,
      purposes: [...new Set(input.purposes)],
      noticeKey: notice.key,
      noticeVersion: notice.version,
      ageCategory: privacy.ageCategory,
      // Marketing choices are recorded in the choice ledger, never inferred from a form consent.
      marketingConsent: false,
      guardianName: isMinor ? privacy.guardian!.name.trim() : null,
      guardianEmail: isMinor ? privacy.guardian!.email.trim().toLowerCase() : null,
      guardianRelationship: isMinor ? privacy.guardian!.relationship : null,
      guardianStatus: isMinor ? "PENDING" : "NOT_REQUIRED",
      guardianTokenHash: token ? sha256(token) : null,
      guardianTokenExpiresAt: isMinor ? new Date(Date.now() + GUARDIAN_RESPONSE_DAYS * 86_400_000) : null,
      ipHash: hashIp(input.ip),
      userAgent: input.userAgent?.slice(0, 512) || null,
    });

    // A minor cannot accept the Terms; the guardian does so when approving.
    if (input.termsAccepted && !isMinor) {
      await TermsService.record({ subjectType: input.subjectType, subjectId: input.subjectId, ip: input.ip });
    }

    if (isMinor && token) {
      try {
        await sendGuardianRequest(record, token, input.childName ?? null);
      } catch (error) {
        console.error("[privacy] guardian email failed", error);
      }
    }
    return { consentId: String(record.id), guardianStatus: isMinor ? "PENDING" : "NOT_REQUIRED" };
  },

  async getStatus(subjectType: ConsentSubjectType, subjectId: string): Promise<ConsentStatus> {
    const record = await ConsentRecord.findOne({
      where: { subjectType, subjectId },
      order: [["createdAt", "DESC"]],
    });
    if (!record) return { ageCategory: null, guardianStatus: null, blocked: false };
    const blocked = record.ageCategory === "MINOR" && record.guardianStatus !== "APPROVED";
    return { ageCategory: record.ageCategory, guardianStatus: record.guardianStatus, blocked };
  },

  /** Throws 403 while a minor's guardian consent or guardian verification is outstanding (or refused). */
  async assertNotBlocked(subjectType: ConsentSubjectType, subjectId: string) {
    const status = await PrivacyService.getStatus(subjectType, subjectId);
    if (status.blocked) {
      throw new AppError(
        403,
        status.guardianStatus === "AWAITING_VERIFICATION"
          ? "Your parent or guardian approved. Our team is verifying their identity; you can continue once that is done."
          : "A parent or guardian must approve this request before it can be used. We have emailed them a link.",
        "GUARDIAN_CONSENT_PENDING",
      );
    }
  },

  async lookupGuardianRequest(token: string) {
    const record = await ConsentRecord.findOne({ where: { guardianTokenHash: sha256(token) } });
    if (!record || record.guardianStatus !== "PENDING") {
      throw new AppError(404, "This consent link is invalid or has already been used.", "GUARDIAN_TOKEN_INVALID");
    }
    if (!record.guardianTokenExpiresAt || record.guardianTokenExpiresAt.getTime() <= Date.now()) {
      throw new AppError(410, "This consent link has expired.", "GUARDIAN_TOKEN_EXPIRED");
    }
    return {
      guardianName: record.guardianName,
      purposes: record.purposes.map((p) => PURPOSE_LABELS[p] ?? p),
      requestedAt: record.createdAt.toISOString(),
      expiresAt: record.guardianTokenExpiresAt.toISOString(),
      notice: getNotice("guardian"),
    };
  },

  /** Guardian decision. Approval moves to staff identity verification; it does not activate anything yet. */
  async respondToGuardianRequest(input: { token: string; decision: "APPROVE" | "DECLINE"; ip?: string | null }) {
    const record = await ConsentRecord.findOne({ where: { guardianTokenHash: sha256(input.token) } });
    if (!record || record.guardianStatus !== "PENDING") {
      throw new AppError(404, "This consent link is invalid or has already been used.", "GUARDIAN_TOKEN_INVALID");
    }
    if (!record.guardianTokenExpiresAt || record.guardianTokenExpiresAt.getTime() <= Date.now()) {
      throw new AppError(410, "This consent link has expired.", "GUARDIAN_TOKEN_EXPIRED");
    }
    const now = new Date();
    if (input.decision === "APPROVE") {
      await record.update({ guardianStatus: "AWAITING_VERIFICATION", guardianRespondedAt: now, guardianTokenHash: null });
      if (record.subjectType === "USER" || record.subjectType === "REGISTRATION") {
        await TermsService.record({ subjectType: record.subjectType, subjectId: record.subjectId, acceptedBy: "GUARDIAN", ip: input.ip });
      }
      const env = loadEnv();
      if (env.SMTP_TO) {
        await sendEmail({
          to: env.SMTP_TO,
          subject: "[Privacy] Guardian approved — identity verification needed",
          text: `A parent/guardian approved a request for a person under 18 (${record.subjectType}). Verify the guardian's identity within ${GUARDIAN_VERIFICATION_DAYS} days in the admin panel → Guardian verifications, or the submission is deleted.`,
        }).catch(() => undefined);
      }
      return { status: "AWAITING_VERIFICATION" as const };
    }
    await record.update({ guardianStatus: "DECLINED", guardianRespondedAt: now });
    await eraseSubject(record);
    return { status: "DECLINED" as const };
  },

  async listAwaitingVerification() {
    const rows = await ConsentRecord.findAll({
      where: { guardianStatus: "AWAITING_VERIFICATION" },
      order: [["guardianRespondedAt", "ASC"]],
      limit: 200,
    });
    return rows.map((r) => ({
      id: String(r.id),
      subjectType: r.subjectType,
      purposes: r.purposes.map((p) => PURPOSE_LABELS[p] ?? p),
      childEmail: r.email,
      guardianName: r.guardianName,
      guardianEmail: r.guardianEmail,
      guardianRelationship: r.guardianRelationship,
      guardianRespondedAt: r.guardianRespondedAt?.toISOString() ?? null,
      verifyBy: r.guardianRespondedAt
        ? new Date(r.guardianRespondedAt.getTime() + GUARDIAN_VERIFICATION_DAYS * 86_400_000).toISOString()
        : null,
    }));
  },

  /** Staff record of the guardian identity check. Only after VERIFIED is the child's request activated. */
  async verifyGuardian(input: {
    consentId: string;
    decision: "VERIFIED" | "REJECTED";
    method?: string;
    note: string;
    adminUserId: string;
    adminEmail: string;
  }) {
    const record = await ConsentRecord.findByPk(input.consentId);
    if (!record || record.guardianStatus !== "AWAITING_VERIFICATION") {
      throw new AppError(404, "No guardian verification pending for this record.", "NOT_FOUND");
    }
    const now = new Date();
    await AuditLog.create({
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      event: `guardian_verification.${input.decision.toLowerCase()}`,
      targetType: "consent_record",
      targetId: record.id,
      metaJson: JSON.stringify({ method: input.method ?? null }),
    }).catch(() => undefined);

    if (input.decision === "VERIFIED") {
      await record.update({
        guardianStatus: "APPROVED",
        guardianVerifiedAt: now,
        guardianVerificationMethod: input.method ?? "OTHER",
        guardianVerificationNote: input.note,
        guardianVerifiedByAdminId: input.adminUserId,
      });
      if (record.subjectType === "CONTACT_LEAD") {
        await ContactLead.update({ status: "NEW" }, { where: { id: record.subjectId } });
      }
      return { status: "APPROVED" as const };
    }
    await record.update({
      guardianStatus: "DECLINED",
      guardianVerificationNote: input.note,
      guardianVerifiedByAdminId: input.adminUserId,
    });
    await eraseSubject(record);
    return { status: "DECLINED" as const };
  },

  /** Daily job: erase minors' submissions whose guardian never responded or was never verified. */
  async purgeExpiredGuardianRequests() {
    const verificationCutoff = new Date(Date.now() - GUARDIAN_VERIFICATION_DAYS * 86_400_000);
    const expired = await ConsentRecord.findAll({
      where: {
        [Op.or]: [
          { guardianStatus: "PENDING", guardianTokenExpiresAt: { [Op.lte]: new Date() } },
          { guardianStatus: "AWAITING_VERIFICATION", guardianRespondedAt: { [Op.lte]: verificationCutoff } },
        ],
      },
      limit: 500,
    });
    for (const record of expired) {
      await record.update({ guardianStatus: "EXPIRED" });
      await eraseSubject(record);
    }
    return { erased: expired.length };
  },
};
