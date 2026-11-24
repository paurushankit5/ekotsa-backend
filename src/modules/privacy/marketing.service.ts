import crypto from "node:crypto";
import { Op } from "sequelize";
import { loadEnv, type Env } from "../../config/env.js";
import {
  ContactLead,
  CustomerRegistration,
  MarketingSuppression,
  PrivacyChoiceEvent,
  User,
} from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { sendEmail } from "../../services/mailer.js";
import { ChoicesService, normalizeEmail } from "./choices.service.js";
import { OPERATOR } from "./notices.js";

/**
 * Promotional email controls. Nothing in the app sends promotional email yet; when it does it MUST go
 * through sendPromotional(), which applies the server-side send gate (opt-in + suppression) and adds a
 * visible unsubscribe link plus RFC 8058 one-click headers. Essential account/licence/security mail is
 * sent separately and never carries promotion.
 */

const TOKEN_TTL_DAYS = 365;

function tokenKey(env: Env) {
  return Buffer.from(crypto.hkdfSync("sha256", env.JWT_SECRET, Buffer.from("ekotsa-privacy"), Buffer.from("unsubscribe"), 32));
}

type TokenPayload = { e: string; c: "email"; iat: number };

/** Opaque, authenticated token (AES-256-GCM): reveals nothing and cannot be forged. */
export const UnsubscribeToken = {
  create(email: string, env: Env = loadEnv()) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(env), iv);
    const payload: TokenPayload = { e: normalizeEmail(email), c: "email", iat: Math.floor(Date.now() / 1000) };
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
  },
  read(token: string, env: Env = loadEnv()): { email: string; expired: boolean } | null {
    try {
      const raw = Buffer.from(token, "base64url");
      if (raw.length < 12 + 16 + 10) return null;
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(raw.length - 16);
      const body = raw.subarray(12, raw.length - 16);
      const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(env), iv);
      decipher.setAuthTag(tag);
      const payload = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")) as TokenPayload;
      const expired = Date.now() / 1000 - payload.iat > TOKEN_TTL_DAYS * 86_400;
      return { email: payload.e, expired };
    } catch {
      return null;
    }
  },
};

async function knownAddress(email: string) {
  const [u, r, l, c] = await Promise.all([
    User.count({ where: { email } }),
    CustomerRegistration.count({ where: { normalizedEmail: email } }),
    ContactLead.count({ where: { email } }),
    PrivacyChoiceEvent.count({ where: { subjectType: "EMAIL", subjectId: email } }),
  ]);
  return u + r + l + c > 0;
}

export const MarketingService = {
  async isSuppressed(email: string) {
    const n = await MarketingSuppression.count({
      where: { normalizedEmail: normalizeEmail(email), channel: { [Op.in]: ["email", "all"] } },
    });
    return n > 0;
  },

  /** Server-side send gate: explicit current opt-in AND not suppressed. */
  async canSend(email: string) {
    const normalized = normalizeEmail(email);
    if (await MarketingService.isSuppressed(normalized)) return false;
    const user = await User.findOne({ where: { email: normalized } });
    const subjects = [{ type: "EMAIL" as const, id: normalized }, ...(user ? [{ type: "USER" as const, id: user.id }] : [])];
    const effective = await ChoicesService.effective(subjects);
    return effective.marketing_email?.action === "GRANT";
  },

  /** Immediate, idempotent unsubscribe. Neutral result: never reveals whether the address is known. */
  async unsubscribe(token: string, reason: "UNSUBSCRIBE_LINK" | "ONE_CLICK", ip?: string | null) {
    const parsed = UnsubscribeToken.read(token);
    if (!parsed) throw new AppError(400, "This unsubscribe link is not valid. You can request a new one below.", "UNSUBSCRIBE_TOKEN_INVALID");
    if (parsed.expired) throw new AppError(410, "This unsubscribe link has expired. You can request a new one below.", "UNSUBSCRIBE_TOKEN_EXPIRED");
    await MarketingSuppression.findOrCreate({
      where: { normalizedEmail: parsed.email, channel: "email" },
      defaults: { normalizedEmail: parsed.email, channel: "email", reason, source: "unsubscribe" },
    });
    await ChoicesService.record({
      subject: { type: "EMAIL", id: parsed.email },
      purpose: "marketing_email",
      action: "WITHDRAW",
      source: reason === "ONE_CLICK" ? "list-unsubscribe-one-click" : "unsubscribe-page",
      email: parsed.email,
      ip,
    });
    return { unsubscribed: true };
  },

  /** Expired/lost link recovery: email a fresh link if we hold the address. Always a neutral response. */
  async sendNewLink(email: string) {
    const normalized = normalizeEmail(email);
    if (await knownAddress(normalized)) {
      const env = loadEnv();
      const link = new URL("/unsubscribe", env.FRONTEND_URL);
      link.searchParams.set("token", UnsubscribeToken.create(normalized));
      await sendEmail({
        to: normalized,
        subject: "Your Ekotsa unsubscribe link",
        text: `Open this link to stop product update emails from Ekotsa. It works immediately:\n${link}\n\nIf you did not ask for this, you can ignore this email.\n\n${OPERATOR.tradingAs} · ${OPERATOR.address}`,
      }).catch((error) => console.error("[marketing] unsubscribe link email failed", error));
    }
    return { ok: true };
  },

  /** Build the unsubscribe parts every promotional email must carry. */
  buildUnsubscribeParts(email: string, env: Env = loadEnv()) {
    const token = UnsubscribeToken.create(email, env);
    const page = new URL("/unsubscribe", env.FRONTEND_URL);
    page.searchParams.set("token", token);
    const apiBase = env.APP_PUBLIC_URL || env.FRONTEND_URL;
    const oneClick = new URL("/api/v1/marketing/unsubscribe", apiBase);
    oneClick.searchParams.set("token", token);
    return {
      pageUrl: page.toString(),
      headers: {
        "List-Unsubscribe": `<${oneClick.toString()}>, <mailto:${OPERATOR.email}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  },

  /** The only permitted path for promotional email. Returns sent:false when the gate blocks it. */
  async sendPromotional(input: { to: string; subject: string; text: string }) {
    if (!(await MarketingService.canSend(input.to))) return { sent: false as const, reason: "NO_CONSENT_OR_SUPPRESSED" };
    const parts = MarketingService.buildUnsubscribeParts(input.to);
    await sendEmail({
      to: input.to,
      subject: input.subject,
      text: `${input.text}\n\n—\nYou receive this because you opted in to Ekotsa product updates.\nUnsubscribe instantly: ${parts.pageUrl}\n${OPERATOR.tradingAs} · ${OPERATOR.address}`,
      headers: parts.headers,
    });
    return { sent: true as const };
  },
};
