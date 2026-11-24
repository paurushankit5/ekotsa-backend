import { AuditLog, LegalHold } from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";

/**
 * Legal holds pause retention deletion (and must be checked before honouring an erasure request)
 * when Ekotsa is required to keep data: a dispute, an investigation, a statutory/court request.
 */
export const LegalHoldsService = {
  async list() {
    const rows = await LegalHold.findAll({ order: [["createdAt", "DESC"]], limit: 300 });
    return rows.map((h) => ({
      id: String(h.id),
      subjectType: h.subjectType,
      subjectId: h.subjectId,
      email: h.email,
      reason: h.reason,
      active: !h.releasedAt,
      createdAt: h.createdAt.toISOString(),
      releasedAt: h.releasedAt?.toISOString() ?? null,
    }));
  },

  async create(input: {
    subjectType: "USER" | "REGISTRATION" | "CONTACT_LEAD" | "EMAIL";
    subjectId?: string | null;
    email?: string | null;
    reason: string;
    adminUserId: string;
    adminEmail: string;
  }) {
    if (!input.subjectId && !input.email) {
      throw new AppError(400, "Give the record ID or the email address to hold.", "VALIDATION_ERROR");
    }
    const hold = await LegalHold.create({
      subjectType: input.subjectType,
      subjectId: input.subjectId?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      reason: input.reason.trim(),
      createdByAdminId: input.adminUserId,
    });
    await AuditLog.create({
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      event: "legal_hold.created",
      targetType: "legal_hold",
      targetId: hold.id,
      metaJson: JSON.stringify({ subjectType: hold.subjectType }),
    }).catch(() => undefined);
    return { id: String(hold.id) };
  },

  async release(input: { id: string; adminUserId: string; adminEmail: string }) {
    const hold = await LegalHold.findByPk(input.id);
    if (!hold || hold.releasedAt) throw new AppError(404, "Active legal hold not found.", "NOT_FOUND");
    await hold.update({ releasedAt: new Date(), releasedByAdminId: input.adminUserId });
    await AuditLog.create({
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      event: "legal_hold.released",
      targetType: "legal_hold",
      targetId: hold.id,
    }).catch(() => undefined);
    return { released: true };
  },
};

/**
 * SQL fragment excluding rows covered by an active hold, for tables that hold personal data.
 * `alias` is the table name/alias used in the surrounding query.
 */
export function holdExclusion(table: "contact_leads" | "customer_registrations" | "users", alias: string = table) {
  const map = {
    contact_leads: { type: "CONTACT_LEAD", email: "email" },
    customer_registrations: { type: "REGISTRATION", email: `"normalizedEmail"` },
    users: { type: "USER", email: "email" },
  }[table];
  return `NOT EXISTS (SELECT 1 FROM legal_holds h WHERE h."releasedAt" IS NULL AND (
    (h."subjectType" = '${map.type}' AND h."subjectId" = ${alias}.id)
    OR (h.email IS NOT NULL AND h.email = LOWER(${alias}.${map.email}))))`;
}
