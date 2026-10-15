import { Op } from "sequelize";
import { loadEnv } from "../../config/env.js";
import {
  Device,
  DeviceResetRequest,
  User,
} from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { writeAuditLog } from "../../services/audit-log.js";
import { enqueueEmailNotification } from "../../services/notifications/outbox.js";
import { DeviceService } from "../devices/devices.service.js";

function cooldownDays() {
  return loadEnv().DEVICE_RESET_COOLDOWN_DAYS;
}

function maxRequests30d() {
  return loadEnv().DEVICE_RESET_MAX_REQUESTS_30D;
}

function requireDeviceId() {
  return loadEnv().DEVICE_RESET_REQUIRE_DEVICE_ID;
}

export const DeviceResetService = {
  policy() {
    return {
      cooldownDays: cooldownDays(),
      maxRequests30d: maxRequests30d(),
      requireDeviceId: requireDeviceId(),
    };
  },

  async listForUser(userId: string): Promise<{
    reset: {
      cooldownDays: number;
      nextAllowedAt: string | null;
      requests: Array<{
        id: string;
        status: string;
        deviceId: string | null;
        reason: string | null;
        createdAt: string;
        handledAt: string | null;
      }>;
    };
  }> {
    const requests = await DeviceResetRequest.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    const lastApproved = requests.find((r) => r.status === "APPROVED");
    let nextAllowedAt: string | null = null;
    if (lastApproved) {
      const next = new Date(
        lastApproved.handledAt?.getTime() ?? lastApproved.createdAt.getTime(),
      );
      next.setDate(next.getDate() + cooldownDays());
      if (next.getTime() > Date.now()) nextAllowedAt = next.toISOString();
    }

    return {
      reset: {
        cooldownDays: cooldownDays(),
        nextAllowedAt,
        requests: requests.map((r) => ({
          id: r.id,
          status: r.status,
          deviceId: r.deviceId,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
          handledAt: r.handledAt?.toISOString() ?? null,
        })),
      },
    };
  },

  async createRequest(input: {
    userId: string;
    email: string;
    deviceId?: string | null;
    reason?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<{ request: { id: string; status: string; createdAt: string } }> {
    if (requireDeviceId() && !input.deviceId) {
      throw new AppError(400, "deviceId required", "DEVICE_ID_REQUIRED");
    }

    if (input.deviceId) {
      const device = await Device.findByPk(input.deviceId);
      if (!device || device.userId !== input.userId) {
        throw new AppError(404, "Device not found", "DEVICE_NOT_FOUND");
      }
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCount = await DeviceResetRequest.count({
      where: { userId: input.userId, createdAt: { [Op.gte]: since } },
    });
    if (recentCount >= maxRequests30d()) {
      throw new AppError(429, "Too many reset requests", "RESET_LIMIT");
    }

    const lastApproved = await DeviceResetRequest.findOne({
      where: { userId: input.userId, status: "APPROVED" },
      order: [["handledAt", "DESC"]],
    });
    if (lastApproved) {
      const next = new Date(
        lastApproved.handledAt?.getTime() ?? lastApproved.createdAt.getTime(),
      );
      next.setDate(next.getDate() + cooldownDays());
      if (next.getTime() > Date.now()) {
        throw new AppError(429, "Reset cooldown active", "RESET_COOLDOWN");
      }
    }

    const pending = await DeviceResetRequest.findOne({
      where: { userId: input.userId, status: "PENDING" },
    });
    if (pending) {
      throw new AppError(409, "Pending reset already exists", "RESET_PENDING");
    }

    const request = await DeviceResetRequest.create({
      userId: input.userId,
      deviceId: input.deviceId ?? null,
      reason: input.reason ?? null,
      status: "PENDING",
    });

    await writeAuditLog({
      event: "device_reset.requested",
      actorUserId: input.userId,
      actorEmail: input.email,
      actorRole: "USER",
      targetType: "DeviceResetRequest",
      targetId: request.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    const adminTo = loadEnv().SMTP_TO;
    if (adminTo) {
      await enqueueEmailNotification({
        toEmail: adminTo,
        template: "device_reset_requested",
        payload: { userEmail: input.email, requestId: request.id },
        dedupeKey: `device_reset_requested:${request.id}`,
      }).catch(() => undefined);
    }

    return {
      request: {
        id: request.id,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      },
    };
  },

  async listAdmin(input?: { status?: string; take?: number }): Promise<{
    requests: Array<{
      id: string;
      userId: string;
      userEmail: string | null;
      deviceId: string | null;
      status: string;
      reason: string | null;
      note: string | null;
      createdAt: string;
      handledAt: string | null;
    }>;
  }> {
    const where = input?.status ? { status: input.status as never } : {};
    const requests = await DeviceResetRequest.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: input?.take ?? 100,
    });
    const users = await User.findAll({
      where: { id: { [Op.in]: [...new Set(requests.map((r) => r.userId))] } },
    });
    const emailMap = new Map(users.map((u) => [u.id, u.email]));
    return {
      requests: requests.map((r) => ({
        id: r.id,
        userId: r.userId,
        userEmail: emailMap.get(r.userId) ?? null,
        deviceId: r.deviceId,
        status: r.status,
        reason: r.reason,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        handledAt: r.handledAt?.toISOString() ?? null,
      })),
    };
  },

  async decide(input: {
    requestId: string;
    action: "approve" | "reject";
    note?: string | null;
    adminUserId: string;
    adminEmail: string;
  }): Promise<{ request: { id: string; status: string } }> {
    const request = await DeviceResetRequest.findByPk(input.requestId);
    if (!request) throw new AppError(404, "Reset request not found", "RESET_NOT_FOUND");
    if (request.status !== "PENDING") {
      throw new AppError(409, "Reset request already handled", "RESET_CONFLICT");
    }

    const user = await User.findByPk(request.userId);

    if (input.action === "approve") {
      if (request.deviceId) {
        await DeviceService.revoke({
          deviceId: request.deviceId,
          reason: input.note ?? "device reset approved",
        });
      }
      await request.update({
        status: "APPROVED",
        handledAt: new Date(),
        handledByAdminId: input.adminUserId,
        note: input.note ?? null,
      });
      if (user) {
        await enqueueEmailNotification({
          toEmail: user.email,
          template: "device_reset_approved",
          payload: { requestId: request.id },
          dedupeKey: `device_reset_approved:${request.id}`,
        }).catch(() => undefined);
      }
    } else {
      await request.update({
        status: "REJECTED",
        handledAt: new Date(),
        handledByAdminId: input.adminUserId,
        note: input.note ?? null,
      });
      if (user) {
        await enqueueEmailNotification({
          toEmail: user.email,
          template: "device_reset_rejected",
          payload: { requestId: request.id },
          dedupeKey: `device_reset_rejected:${request.id}`,
        }).catch(() => undefined);
      }
    }

    await writeAuditLog({
      event: `device_reset.${input.action}`,
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      targetType: "DeviceResetRequest",
      targetId: request.id,
    });

    return { request: { id: request.id, status: request.status } };
  },
};
