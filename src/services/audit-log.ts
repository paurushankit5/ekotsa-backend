import { AuditLog } from "../db/models/index.js";
import type { UserRole } from "../db/models/User.js";

/** Best-effort audit — never throw into callers. */
export async function writeAuditLog(input: {
  event: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  severity?: string;
  ip?: string | null;
  userAgent?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await AuditLog.create({
      event: input.event,
      actorUserId: input.actorUserId ?? null,
      actorEmail: input.actorEmail ?? null,
      actorRole: input.actorRole ?? null,
      severity: input.severity ?? "info",
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metaJson: input.meta ? JSON.stringify(input.meta) : null,
    });
  } catch (error) {
    console.warn("[audit] failed to write", input.event, error);
  }
}
