import { Op, fn, col } from "sequelize";
import {
  LicenseGrant,
  NotificationOutbox,
  User,
} from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { writeAuditLog } from "../../services/audit-log.js";
import {
  cloneForManualResend,
  enqueueEmailNotification,
} from "../../services/notifications/outbox.js";
import { processNotificationOutbox } from "../../services/notifications/processor.js";

export const NotificationsService = {
  async list(input?: { status?: string; take?: number }): Promise<{
    notifications: Array<{
      id: string;
      status: string;
      channel: string;
      toEmail: string;
      template: string;
      subject: string | null;
      scheduledAt: string | null;
      sentAt: string | null;
      failedAt: string | null;
      attemptCount: number;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const where = input?.status ? { status: input.status as never } : {};
    const rows = await NotificationOutbox.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: Math.min(Math.max(input?.take ?? 100, 1), 300),
    });
    return {
      notifications: rows.map((r) => ({
        id: r.id,
        status: r.status,
        channel: r.channel,
        toEmail: r.toEmail,
        template: r.template,
        subject: r.subject,
        scheduledAt: r.scheduledAt?.toISOString() ?? null,
        sentAt: r.sentAt?.toISOString() ?? null,
        failedAt: r.failedAt?.toISOString() ?? null,
        attemptCount: r.attemptCount,
        lastError: r.lastError,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  },

  async templateStats(): Promise<{
    since: string;
    templates: Array<{
      template: string;
      total: number;
      pending: number;
      sending: number;
      sent: number;
      failed: number;
      canceled: number;
    }>;
  }> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await NotificationOutbox.findAll({
      attributes: ["template", "status", [fn("COUNT", col("id")), "count"]],
      where: { createdAt: { [Op.gte]: since } },
      group: ["template", "status"],
      raw: true,
    });

    const map = new Map<
      string,
      {
        template: string;
        total: number;
        pending: number;
        sending: number;
        sent: number;
        failed: number;
        canceled: number;
      }
    >();

    for (const row of rows as unknown as Array<{
      template: string;
      status: string;
      count: string;
    }>) {
      const entry = map.get(row.template) ?? {
        template: row.template,
        total: 0,
        pending: 0,
        sending: 0,
        sent: 0,
        failed: 0,
        canceled: 0,
      };
      const n = Number(row.count);
      entry.total += n;
      if (row.status === "PENDING") entry.pending += n;
      if (row.status === "SENDING") entry.sending += n;
      if (row.status === "SENT") entry.sent += n;
      if (row.status === "FAILED") entry.failed += n;
      if (row.status === "CANCELED") entry.canceled += n;
      map.set(row.template, entry);
    }

    return {
      since: since.toISOString(),
      templates: [...map.values()].sort((a, b) => b.total - a.total),
    };
  },

  async sendNow(input: {
    id: string;
    adminUserId: string;
    adminEmail: string;
    reason?: string | null;
  }): Promise<{ ok: true; queuedId?: string }> {
    const row = await NotificationOutbox.findByPk(input.id);
    if (!row) throw new AppError(404, "Notification not found", "NOTIF_NOT_FOUND");

    if (row.status === "SENT") {
      const cloned = await cloneForManualResend(row.id);
      await writeAuditLog({
        event: "notification.send_now.clone",
        actorUserId: input.adminUserId,
        actorEmail: input.adminEmail,
        actorRole: "ADMIN",
        targetType: "NotificationOutbox",
        targetId: cloned.queuedId,
        meta: { reason: input.reason ?? null, fromId: row.id },
      });
      return { ok: true, queuedId: cloned.queuedId };
    }

    if (row.status !== "PENDING" && row.status !== "FAILED") {
      throw new AppError(409, "Cannot send-now in current status", "NOTIF_CONFLICT");
    }

    await row.update({
      status: "PENDING",
      scheduledAt: new Date(),
      failedAt: null,
      lastError: null,
    });

    await writeAuditLog({
      event: "notification.send_now",
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      targetType: "NotificationOutbox",
      targetId: row.id,
      meta: { reason: input.reason ?? null },
    });

    return { ok: true };
  },

  async retry(input: {
    id: string;
    adminUserId: string;
    adminEmail: string;
  }): Promise<{ ok: true }> {
    const row = await NotificationOutbox.findByPk(input.id);
    if (!row) throw new AppError(404, "Notification not found", "NOTIF_NOT_FOUND");
    if (row.status !== "FAILED") {
      throw new AppError(409, "Only FAILED notifications can be retried", "NOTIF_CONFLICT");
    }
    await row.update({
      status: "PENDING",
      scheduledAt: new Date(),
      failedAt: null,
      lastError: null,
    });
    await writeAuditLog({
      event: "notification.retry",
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      targetType: "NotificationOutbox",
      targetId: row.id,
    });
    return { ok: true };
  },

  async cancel(input: {
    id: string;
    adminUserId: string;
    adminEmail: string;
  }): Promise<{ ok: true }> {
    const row = await NotificationOutbox.findByPk(input.id);
    if (!row) throw new AppError(404, "Notification not found", "NOTIF_NOT_FOUND");
    if (row.status !== "PENDING" && row.status !== "FAILED") {
      throw new AppError(409, "Cannot cancel in current status", "NOTIF_CONFLICT");
    }
    await row.update({ status: "CANCELED" });
    await writeAuditLog({
      event: "notification.cancel",
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      targetType: "NotificationOutbox",
      targetId: row.id,
    });
    return { ok: true };
  },

  async process(take?: number) {
    return processNotificationOutbox({ take });
  },

  async scheduleExpiryReminders(): Promise<{
    scheduled: number;
    grants7d: number;
    grants3d: number;
  }> {
    const now = new Date();
    const in7dStart = new Date(now.getTime() + 6.5 * 24 * 60 * 60 * 1000);
    const in7dEnd = new Date(now.getTime() + 7.5 * 24 * 60 * 60 * 1000);
    const in3dStart = new Date(now.getTime() + 2.5 * 24 * 60 * 60 * 1000);
    const in3dEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

    const grants7d = await LicenseGrant.findAll({
      where: {
        status: "ACTIVE",
        revokedAt: null,
        expiresAt: { [Op.between]: [in7dStart, in7dEnd] },
      },
      limit: 500,
    });
    const grants3d = await LicenseGrant.findAll({
      where: {
        status: "ACTIVE",
        revokedAt: null,
        expiresAt: { [Op.between]: [in3dStart, in3dEnd] },
      },
      limit: 500,
    });

    let scheduled = 0;
    for (const grant of grants7d) {
      const user = await User.findByPk(grant.userId);
      if (!user) continue;
      const dayKey = grant.expiresAt.toISOString().slice(0, 10);
      const result = await enqueueEmailNotification({
        toEmail: user.email,
        template: "license_expiry_7d",
        payload: {
          plan: grant.plan,
          expiresAt: grant.expiresAt.toISOString(),
        },
        dedupeKey: `license_expiry_7d:${grant.id}:${dayKey}`,
      });
      if (result.created) scheduled += 1;
    }
    for (const grant of grants3d) {
      const user = await User.findByPk(grant.userId);
      if (!user) continue;
      const dayKey = grant.expiresAt.toISOString().slice(0, 10);
      const result = await enqueueEmailNotification({
        toEmail: user.email,
        template: "license_expiry_3d",
        payload: {
          plan: grant.plan,
          expiresAt: grant.expiresAt.toISOString(),
        },
        dedupeKey: `license_expiry_3d:${grant.id}:${dayKey}`,
      });
      if (result.created) scheduled += 1;
    }

    return {
      scheduled,
      grants7d: grants7d.length,
      grants3d: grants3d.length,
    };
  },
};
