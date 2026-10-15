import { Op } from "sequelize";
import { loadEnv } from "../../config/env.js";
import { NotificationOutbox } from "../../db/models/index.js";
import { sendEmail } from "../mailer.js";
import { renderEmail } from "./templates.js";

function maxAttempts() {
  const env = loadEnv();
  const v = Number(env.NOTIFICATIONS_MAX_ATTEMPTS ?? 6);
  return Number.isFinite(v) && v >= 1 && v <= 20 ? v : 6;
}

function backoffMs(attempt: number) {
  const base = Math.min(60 * 60 * 1000, Math.pow(2, Math.max(0, attempt - 1)) * 60 * 1000);
  const jitter = Math.floor(Math.random() * 15_000);
  return base + jitter;
}

export async function processNotificationOutbox(input?: {
  take?: number;
}): Promise<{ processed: number; sent: number; failed: number }> {
  const take = input?.take ?? 25;
  const now = new Date();
  const pending = await NotificationOutbox.findAll({
    where: {
      status: "PENDING",
      [Op.or]: [{ scheduledAt: null }, { scheduledAt: { [Op.lte]: now } }],
    },
    order: [["scheduledAt", "ASC"]],
    limit: take,
  });

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const [claimed] = await NotificationOutbox.update(
      { status: "SENDING" },
      { where: { id: row.id, status: "PENDING" } },
    );
    if (claimed !== 1) continue;

    try {
      const rendered = renderEmail(row.template, row.payloadJson);
      await sendEmail({
        to: row.toEmail,
        subject: row.subject || rendered.subject,
        text: rendered.text,
      });
      await row.update({
        status: "SENT",
        sentAt: new Date(),
        attemptCount: row.attemptCount + 1,
        lastError: null,
      });
      sent += 1;
    } catch (error) {
      const attempts = row.attemptCount + 1;
      const errMsg = error instanceof Error ? error.message : String(error);
      if (attempts >= maxAttempts()) {
        await row.update({
          status: "FAILED",
          failedAt: new Date(),
          attemptCount: attempts,
          lastError: errMsg.slice(0, 2000),
        });
        failed += 1;
      } else {
        await row.update({
          status: "PENDING",
          attemptCount: attempts,
          lastError: errMsg.slice(0, 2000),
          scheduledAt: new Date(Date.now() + backoffMs(attempts)),
        });
        failed += 1;
      }
    }
  }

  return { processed: pending.length, sent, failed };
}
