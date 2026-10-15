import { createId } from "@paralleldrive/cuid2";
import { NotificationOutbox } from "../../db/models/index.js";
import { renderEmail } from "./templates.js";

export async function enqueueEmailNotification(input: {
  toEmail: string;
  template: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  scheduledAt?: Date | null;
  subject?: string | null;
}): Promise<{ id: string; created: boolean }> {
  if (input.dedupeKey) {
    const existing = await NotificationOutbox.findOne({
      where: { dedupeKey: input.dedupeKey },
    });
    if (existing) return { id: existing.id, created: false };
  }

  const payloadJson = input.payload ? JSON.stringify(input.payload) : null;
  const rendered = renderEmail(input.template, payloadJson);

  const row = await NotificationOutbox.create({
    toEmail: input.toEmail.trim().toLowerCase(),
    template: input.template,
    payloadJson,
    subject: input.subject ?? rendered.subject,
    dedupeKey: input.dedupeKey ?? null,
    scheduledAt: input.scheduledAt ?? new Date(),
    status: "PENDING",
    channel: "email",
  });

  return { id: row.id, created: true };
}

export async function cloneForManualResend(id: string): Promise<{ queuedId: string }> {
  const row = await NotificationOutbox.findByPk(id);
  if (!row) throw new Error("Notification not found");
  const dedupeKey = `manual-resend:${row.id}:${createId()}`;
  const created = await NotificationOutbox.create({
    toEmail: row.toEmail,
    template: row.template,
    payloadJson: row.payloadJson,
    subject: row.subject,
    dedupeKey,
    scheduledAt: new Date(),
    status: "PENDING",
    channel: "email",
  });
  return { queuedId: created.id };
}
