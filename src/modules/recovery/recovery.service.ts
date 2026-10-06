import { Op } from "sequelize";
import {
  Device,
  LicenseGrant,
  RecoveryArtifact,
  RecoveryRequest,
  User,
} from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  getGraceDays,
  getMaxOfflineDays,
  signLicenseArtifact,
  type ArtifactStatus,
} from "../../services/license-artifacts.js";
import { writeAuditLog } from "../../services/audit-log.js";

function recoveryStatusForGrant(
  grant: LicenseGrant,
  now: Date,
): { status: ArtifactStatus; graceUntil: Date } {
  const graceUntil = new Date(grant.expiresAt.getTime() + getGraceDays() * 24 * 60 * 60 * 1000);
  if (grant.status === "REVOKED" || grant.revokedAt || grant.status === "SUSPENDED") {
    return { status: "REVOKED", graceUntil };
  }
  if (grant.expiresAt.getTime() > now.getTime()) return { status: "ACTIVE", graceUntil };
  if (graceUntil.getTime() > now.getTime()) return { status: "GRACE", graceUntil };
  return { status: "EXPIRED", graceUntil };
}

type RequestDto = {
  id: string;
  status: string;
  reason: string | null;
  note: string | null;
  requestedAt: string;
  handledAt: string | null;
  expiresAt: string | null;
  userEmail: string | null;
  device: { deviceName: string; platform: string } | null;
  grantId: string;
  artifactId: string | null;
};

type ArtifactDto = {
  id: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  reason: string | null;
  userEmail: string | null;
  device: { deviceName: string; platform: string } | null;
  grantId: string | null;
};

function serializeRequest(
  request: RecoveryRequest,
  userEmail?: string,
  device?: Device | null,
): RequestDto {
  return {
    id: request.id,
    status: request.status,
    reason: request.reason,
    note: request.note,
    requestedAt: request.requestedAt.toISOString(),
    handledAt: request.handledAt?.toISOString() ?? null,
    expiresAt: request.expiresAt?.toISOString() ?? null,
    userEmail: userEmail ?? null,
    device: device
      ? { deviceName: device.deviceName, platform: device.platform }
      : null,
    grantId: request.grantId,
    artifactId: request.artifactId,
  };
}

function serializeArtifact(
  artifact: RecoveryArtifact,
  userEmail?: string | null,
  device?: Device | null,
): ArtifactDto {
  return {
    id: artifact.id,
    issuedAt: artifact.issuedAt.toISOString(),
    expiresAt: artifact.expiresAt.toISOString(),
    revokedAt: artifact.revokedAt?.toISOString() ?? null,
    reason: artifact.reason,
    userEmail: userEmail ?? null,
    device: device
      ? { deviceName: device.deviceName, platform: device.platform }
      : null,
    grantId: artifact.grantId,
  };
}

export const RecoveryService = {
  async createRequest(input: {
    userId: string;
    grantId: string;
    reason?: string | null;
    note?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    email?: string | null;
  }): Promise<{
    recoveryRequest: {
      id: string;
      status: string;
      requestedAt: string;
      expiresAt: string | null;
    };
  }> {
    const grant = await LicenseGrant.findByPk(input.grantId);
    if (!grant || grant.userId !== input.userId) {
      throw new AppError(404, "License grant not found", "GRANT_NOT_FOUND");
    }

    const existing = await RecoveryRequest.findOne({
      where: { userId: input.userId, grantId: input.grantId, status: "PENDING" },
    });
    if (existing) {
      throw new AppError(409, "Pending recovery already exists", "RECOVERY_PENDING");
    }

    const request = await RecoveryRequest.create({
      userId: input.userId,
      grantId: grant.id,
      deviceId: grant.deviceId,
      reason: input.reason ?? null,
      note: input.note ?? null,
      status: "PENDING",
    });

    await writeAuditLog({
      event: "recovery.request.created",
      actorUserId: input.userId,
      actorEmail: input.email,
      actorRole: "USER",
      targetType: "RecoveryRequest",
      targetId: request.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      recoveryRequest: {
        id: request.id,
        status: request.status,
        requestedAt: request.requestedAt.toISOString(),
        expiresAt: request.expiresAt?.toISOString() ?? null,
      },
    };
  },

  async status(userId: string): Promise<{
    recovery: {
      requests: RequestDto[];
      artifacts: ArtifactDto[];
    };
  }> {
    const user = await User.findByPk(userId);
    const requests = await RecoveryRequest.findAll({
      where: { userId },
      order: [["requestedAt", "DESC"]],
      limit: 50,
    });
    const artifacts = await RecoveryArtifact.findAll({
      where: { userId },
      order: [["issuedAt", "DESC"]],
      limit: 50,
    });

    const deviceIds = [
      ...new Set(
        [...requests, ...artifacts]
          .map((r) => ("deviceId" in r ? r.deviceId : null))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const devices = deviceIds.length
      ? await Device.findAll({ where: { id: { [Op.in]: deviceIds } } })
      : [];
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    return {
      recovery: {
        requests: requests.map((r) =>
          serializeRequest(r, user?.email, r.deviceId ? deviceMap.get(r.deviceId) : null),
        ),
        artifacts: artifacts.map((a) =>
          serializeArtifact(a, user?.email, deviceMap.get(a.deviceId) ?? null),
        ),
      },
    };
  },

  async getDownloadableArtifact(input: {
    id: string;
    userId: string;
    enforceValidity?: boolean;
  }): Promise<{ artifactJson: string; filename: string }> {
    let artifact = await RecoveryArtifact.findByPk(input.id);
    if (!artifact) {
      const request = await RecoveryRequest.findByPk(input.id);
      if (request?.artifactId && request.userId === input.userId) {
        artifact = await RecoveryArtifact.findByPk(request.artifactId);
      }
    }
    if (!artifact || artifact.userId !== input.userId) {
      throw new AppError(404, "Recovery artifact not found", "RECOVERY_NOT_FOUND");
    }
    if (input.enforceValidity) {
      if (artifact.revokedAt) {
        throw new AppError(410, "Recovery artifact revoked", "RECOVERY_REVOKED");
      }
      if (artifact.expiresAt.getTime() <= Date.now()) {
        throw new AppError(410, "Recovery artifact expired", "RECOVERY_EXPIRED");
      }
    }
    return {
      artifactJson: artifact.artifactJson,
      filename: `ekotsa-recovery-${artifact.id}.json`,
    };
  },

  async issueArtifact(input: {
    adminUserId: string;
    adminEmail: string;
    grantId: string;
    reason?: string | null;
    expiresInHours?: number;
    requestId?: string | null;
  }): Promise<{
    recoveryRequest: RequestDto | null;
    recovery: { id: string; expiresAt: string };
    artifact: unknown;
  }> {
    const now = new Date();
    const expiresInHours = input.expiresInHours ?? 24 * 7;

    let request: RecoveryRequest | null = null;
    if (input.requestId) {
      request = await RecoveryRequest.findByPk(input.requestId);
      if (!request) throw new AppError(404, "Recovery request not found", "RECOVERY_NOT_FOUND");
      if (request.status !== "PENDING") {
        throw new AppError(409, "Recovery request already handled", "RECOVERY_CONFLICT");
      }
    }

    const grantId = request?.grantId ?? input.grantId;
    const grant = await LicenseGrant.findByPk(grantId);
    if (!grant) throw new AppError(404, "License grant not found", "GRANT_NOT_FOUND");

    const recoveryStatus = recoveryStatusForGrant(grant, now);
    const maxOfflineUntil = new Date(now.getTime() + getMaxOfflineDays() * 24 * 60 * 60 * 1000);
    const toUnix = (d: Date) => Math.floor(d.getTime() / 1000);
    const grantDevice = await Device.findByPk(grant.deviceId);
    let artifactDeviceId = grant.deviceId;
    if (grantDevice?.metadataJson) {
      try {
        const meta = JSON.parse(grantDevice.metadataJson) as { clientDeviceId?: unknown };
        if (typeof meta.clientDeviceId === "string" && meta.clientDeviceId.trim()) {
          artifactDeviceId = meta.clientDeviceId.trim();
        }
      } catch {
        /* ignore */
      }
    }
    const signed = signLicenseArtifact({
      licenseId: grant.id,
      userId: grant.userId,
      deviceId: artifactDeviceId,
      plan: grant.plan,
      status: recoveryStatus.status,
      issuedAt: toUnix(now),
      expiresAt: toUnix(grant.expiresAt),
      graceUntil: toUnix(recoveryStatus.graceUntil),
      maxOfflineUntil: toUnix(maxOfflineUntil),
      trialUntil: null,
      features: null,
    });

    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);
    const record = await RecoveryArtifact.create({
      userId: grant.userId,
      deviceId: grant.deviceId,
      grantId: grant.id,
      artifactJson: JSON.stringify(signed),
      expiresAt,
      reason: input.reason ?? null,
      issuedByAdminId: input.adminUserId,
      metaJson: JSON.stringify({
        recoveryStatus: recoveryStatus.status,
        expiresInHours,
        issuedBy: input.adminUserId,
      }),
    });

    if (request) {
      await request.update({
        status: "APPROVED",
        handledAt: now,
        handledByAdminId: input.adminUserId,
        artifactId: record.id,
        expiresAt,
        note: input.reason ?? request.note,
      });
    }

    await writeAuditLog({
      event: request ? "recovery.request.approve" : "recovery.artifact.issue",
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      targetType: "RecoveryArtifact",
      targetId: record.id,
      meta: { grantId: grant.id, requestId: request?.id ?? null },
    });

    const user = await User.findByPk(grant.userId);
    const device = await Device.findByPk(grant.deviceId);

    return {
      recoveryRequest: request
        ? serializeRequest(request, user?.email, device)
        : null,
      recovery: { id: record.id, expiresAt: record.expiresAt.toISOString() },
      artifact: signed,
    };
  },

  async rejectRequest(input: {
    requestId: string;
    adminUserId: string;
    adminEmail: string;
    reason?: string | null;
  }): Promise<{ recoveryRequest: { id: string; status: string } }> {
    const request = await RecoveryRequest.findByPk(input.requestId);
    if (!request) throw new AppError(404, "Recovery request not found", "RECOVERY_NOT_FOUND");
    if (request.status !== "PENDING") {
      throw new AppError(409, "Recovery request already handled", "RECOVERY_CONFLICT");
    }

    await request.update({
      status: "REJECTED",
      handledAt: new Date(),
      handledByAdminId: input.adminUserId,
      note: input.reason ?? request.note,
    });

    await writeAuditLog({
      event: "recovery.request.reject",
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      targetType: "RecoveryRequest",
      targetId: request.id,
    });

    return { recoveryRequest: { id: request.id, status: request.status } };
  },

  async listArtifacts(input?: { take?: number }): Promise<{
    recoveries: ArtifactDto[];
  }> {
    const artifacts = await RecoveryArtifact.findAll({
      order: [["issuedAt", "DESC"]],
      limit: input?.take ?? 100,
    });
    const userIds = [...new Set(artifacts.map((a) => a.userId))];
    const deviceIds = [...new Set(artifacts.map((a) => a.deviceId))];
    const users = await User.findAll({ where: { id: { [Op.in]: userIds } } });
    const devices = await Device.findAll({ where: { id: { [Op.in]: deviceIds } } });
    const userMap = new Map(users.map((u) => [u.id, u.email]));
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    return {
      recoveries: artifacts.map((a) =>
        serializeArtifact(a, userMap.get(a.userId) ?? null, deviceMap.get(a.deviceId) ?? null),
      ),
    };
  },

  async revokeArtifact(input: {
    id: string;
    adminUserId: string;
    adminEmail: string;
    reason?: string | null;
  }): Promise<{ ok: true }> {
    const artifact = await RecoveryArtifact.findByPk(input.id);
    if (!artifact) throw new AppError(404, "Recovery artifact not found", "RECOVERY_NOT_FOUND");
    await artifact.update({
      revokedAt: new Date(),
      reason: input.reason ?? artifact.reason,
    });
    await writeAuditLog({
      event: "recovery.artifact.revoke",
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      actorRole: "ADMIN",
      targetType: "RecoveryArtifact",
      targetId: artifact.id,
    });
    return { ok: true };
  },
};
