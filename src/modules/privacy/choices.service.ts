import crypto from "node:crypto";
import { Op } from "sequelize";
import { loadEnv, type Env } from "../../config/env.js";
import { ConsentRecord, MarketingSuppression, PrivacyChoiceEvent } from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { assertCurrentNotice, getNotice } from "./notices.js";
import { hashIp } from "./privacy.service.js";

export const CHOICE_PURPOSES = ["analytics", "marketing_email"] as const;
export type ChoicePurpose = (typeof CHOICE_PURPOSES)[number];
export type ChoiceAction = "GRANT" | "DECLINE" | "WITHDRAW";
export type ChoiceSubject = { type: "USER" | "ANON" | "EMAIL"; id: string };

export const ANON_COOKIE = "ek_pc";
const ANON_COOKIE_DAYS = 395; // ~13 months

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

function keyFor(env: Env, label: string) {
  const base = env.JWT_SECRET;
  return Buffer.from(crypto.hkdfSync("sha256", base, Buffer.from("ekotsa-privacy"), Buffer.from(label), 32));
}

/** Signed anonymous identifier used only to keep proof of a visitor's optional-choice history. */
export const AnonId = {
  issue(env: Env = loadEnv()) {
    const id = crypto.randomBytes(16).toString("base64url");
    const mac = crypto.createHmac("sha256", keyFor(env, "anon-id")).update(id).digest("base64url").slice(0, 22);
    return { id, cookie: `${id}.${mac}` };
  },
  verify(cookie: unknown, env: Env = loadEnv()): string | null {
    if (typeof cookie !== "string") return null;
    const [id, mac] = cookie.split(".");
    if (!id || !mac) return null;
    const expected = crypto.createHmac("sha256", keyFor(env, "anon-id")).update(id).digest("base64url").slice(0, 22);
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
  },
  cookieOptions(env: Env = loadEnv()) {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: ANON_COOKIE_DAYS * 86_400_000,
    };
  },
};

async function isMinorEmail(email: string) {
  const record = await ConsentRecord.findOne({
    where: { email: normalizeEmail(email), ageCategory: "MINOR" },
    order: [["createdAt", "DESC"]],
  });
  return Boolean(record);
}

export const ChoicesService = {
  /**
   * Append a choice event. GRANT requires the current notice version; DECLINE/WITHDRAW are always accepted
   * (withdrawing must be as easy as giving). Idempotent on idempotencyKey.
   */
  async record(input: {
    subject: ChoiceSubject;
    purpose: ChoicePurpose;
    action: ChoiceAction;
    noticeVersion?: string | null;
    source: string;
    idempotencyKey?: string | null;
    email?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    if (input.idempotencyKey) {
      const existing = await PrivacyChoiceEvent.findOne({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return { eventId: String(existing.id), action: existing.action as ChoiceAction, duplicate: true };
    }
    const notice = getNotice(input.purpose);
    if (input.action === "GRANT") {
      assertCurrentNotice(input.purpose, input.noticeVersion);
      if (input.purpose === "marketing_email" && input.email && (await isMinorEmail(input.email))) {
        throw new AppError(403, "Product update emails are not available to people under 18.", "MARKETING_NOT_FOR_MINORS");
      }
    }
    const event = await PrivacyChoiceEvent.create({
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      purpose: input.purpose,
      action: input.action,
      noticeKey: notice.key,
      noticeVersion: input.noticeVersion || notice.version,
      source: input.source,
      idempotencyKey: input.idempotencyKey || null,
      ipHash: hashIp(input.ip),
      userAgent: input.userAgent?.slice(0, 512) || null,
    });

    if (input.purpose === "marketing_email" && input.email) {
      const email = normalizeEmail(input.email);
      if (input.action === "GRANT") {
        // An explicit new opt-in by the person lifts their earlier suppression.
        await MarketingSuppression.destroy({ where: { normalizedEmail: email, channel: { [Op.in]: ["email", "all"] } } });
      } else {
        await MarketingSuppression.findOrCreate({
          where: { normalizedEmail: email, channel: "email" },
          defaults: { normalizedEmail: email, channel: "email", reason: "PREFERENCES", source: input.source },
        });
      }
    }
    return { eventId: String(event.id), action: event.action as ChoiceAction, duplicate: false };
  },

  /** Latest action per purpose for the given subjects (e.g. a user and their email). */
  async effective(subjects: ChoiceSubject[]) {
    const out: Record<ChoicePurpose, { action: ChoiceAction; at: string; noticeVersion: string } | null> = {
      analytics: null,
      marketing_email: null,
    };
    if (!subjects.length) return out;
    const events = await PrivacyChoiceEvent.findAll({
      where: { [Op.or]: subjects.map((s) => ({ subjectType: s.type, subjectId: s.id })) },
      order: [["createdAt", "DESC"]],
      limit: 200,
    });
    for (const purpose of CHOICE_PURPOSES) {
      const latest = events.find((e) => e.purpose === purpose);
      if (latest) out[purpose] = { action: latest.action, at: latest.createdAt.toISOString(), noticeVersion: latest.noticeVersion };
    }
    return out;
  },
};
