import { Device, DeviceAuthToken, LicenseGrant, User } from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { signLicenseArtifact, type SignedLicenseArtifactV1 } from "../../services/license-artifacts.js";
import { resolveEntitlement, type EntitlementSnapshot } from "./licenses.entitlement.js";

function toUnix(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

function buildArtifact(entitlement: EntitlementSnapshot): SignedLicenseArtifactV1 {
  // Unix seconds + clientDeviceId — matches Atithi EntitlementMetadata / fingerprint bind.
  return signLicenseArtifact({
    licenseId: entitlement.licenseId ?? "none",
    userId: entitlement.userId,
    deviceId: entitlement.clientDeviceId,
    plan: entitlement.plan,
    status: entitlement.artifactStatus,
    issuedAt: toUnix(entitlement.serverTime),
    expiresAt: toUnix(entitlement.expiresAt),
    graceUntil: toUnix(entitlement.graceUntil),
    maxOfflineUntil: toUnix(entitlement.maxOfflineUntil),
    trialUntil: entitlement.trialUntil ? toUnix(entitlement.trialUntil) : null,
    features: null,
  });
}

async function touchDevice(deviceId: string, tokenId: string) {
  const now = new Date();
  await Device.update(
    { lastSeenAt: now, serverLastSeenAt: now },
    { where: { id: deviceId } },
  );
  await DeviceAuthToken.update({ lastUsedAt: now }, { where: { id: tokenId } });
}

export const LicenseService = {
  async issue(input: {
    userId: string;
    deviceId: string;
    tokenId: string;
  }): Promise<{
    license: { status: string; source: string; state: string };
    artifact: SignedLicenseArtifactV1;
  }> {
    const entitlement = await resolveEntitlement(input);
    if (entitlement.state === "NOT_ACTIVATED") {
      throw new AppError(403, "No trial or paid license for this device", "LICENSE_NOT_ACTIVATED");
    }
    await touchDevice(input.deviceId, input.tokenId);
    const artifact = buildArtifact(entitlement);
    return {
      license: {
        status: entitlement.artifactStatus,
        source: entitlement.source,
        state: entitlement.state,
      },
      artifact,
    };
  },

  async status(input: {
    userId: string;
    deviceId: string;
    tokenId: string;
  }): Promise<{
    state: string;
    expiresAt: number;
    trialUntil: number | null;
    graceUntil: number;
    source: string;
    plan: string | null;
    active: boolean;
    artifact: SignedLicenseArtifactV1 | null;
  }> {
    const entitlement = await resolveEntitlement(input);
    await touchDevice(input.deviceId, input.tokenId);
    const artifact =
      entitlement.state === "NOT_ACTIVATED" ? null : buildArtifact(entitlement);

    return {
      state: entitlement.state,
      expiresAt: toUnix(entitlement.expiresAt),
      trialUntil: entitlement.trialUntil ? toUnix(entitlement.trialUntil) : null,
      graceUntil: toUnix(entitlement.graceUntil),
      source: entitlement.source,
      plan: entitlement.plan,
      active: entitlement.active,
      artifact,
    };
  },

  async refresh(input: {
    userId: string;
    deviceId: string;
    tokenId: string;
    requestedDeviceId?: string;
  }): Promise<{
    license: {
      status: string;
      source: string;
      state: string;
      active: boolean;
      plan: string | null;
      expiresAt: string;
      trialUntil: string | null;
      graceUntil: string;
      serverTime: string;
    };
    artifact: SignedLicenseArtifactV1;
  }> {
    if (input.requestedDeviceId && input.requestedDeviceId !== input.deviceId) {
      // Accept either internal device id — Atithi may send its own local device id string.
      // Prefer token-bound device; ignore mismatch unless it's clearly the DB id of another device.
      const other = await Device.findByPk(input.requestedDeviceId);
      if (other && other.id !== input.deviceId) {
        throw new AppError(403, "Device mismatch", "DEVICE_MISMATCH");
      }
    }

    const entitlement = await resolveEntitlement(input);
    if (entitlement.state === "NOT_ACTIVATED") {
      throw new AppError(403, "No trial or paid license for this device", "LICENSE_NOT_ACTIVATED");
    }
    await touchDevice(input.deviceId, input.tokenId);
    const artifact = buildArtifact(entitlement);

    return {
      license: {
        status: entitlement.artifactStatus,
        source: entitlement.source,
        state: entitlement.state,
        active: entitlement.active,
        plan: entitlement.plan,
        expiresAt: entitlement.expiresAt.toISOString(),
        trialUntil: entitlement.trialUntil?.toISOString() ?? null,
        graceUntil: entitlement.graceUntil.toISOString(),
        serverTime: entitlement.serverTime.toISOString(),
      },
      artifact,
    };
  },

  /** Create/extend a paid grant (admin / ops until payments migrate) */
  async createGrant(input: {
    userId: string;
    deviceId: string;
    plan: string;
    expiresAt?: Date;
    durationDays?: number;
    reason?: string;
  }): Promise<{
    grant: {
      id: string;
      userId: string;
      deviceId: string;
      plan: string;
      status: string;
      issuedAt: string;
      expiresAt: string;
      extended: boolean;
    };
  }> {
    const device = await Device.findByPk(input.deviceId);
    if (!device || device.userId !== input.userId) {
      throw new AppError(404, "Device not found for user", "DEVICE_NOT_FOUND");
    }

    let expiresAt = input.expiresAt;
    if (!expiresAt) {
      const days = input.durationDays ?? 365;
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const existing = await LicenseGrant.findOne({
      where: { userId: input.userId, deviceId: input.deviceId, status: "ACTIVE" },
      order: [["expiresAt", "DESC"]],
    });

    if (existing && !existing.revokedAt && !existing.suspendedAt) {
      const base =
        existing.expiresAt.getTime() > Date.now() ? existing.expiresAt : new Date();
      if (input.durationDays) {
        expiresAt = new Date(base.getTime() + input.durationDays * 24 * 60 * 60 * 1000);
      }
      await existing.update({
        expiresAt,
        plan: input.plan,
        reason: input.reason ?? existing.reason,
        status: "ACTIVE",
      });
      return {
        grant: {
          id: existing.id,
          userId: existing.userId,
          deviceId: existing.deviceId,
          plan: existing.plan,
          status: existing.status,
          issuedAt: existing.issuedAt.toISOString(),
          expiresAt: existing.expiresAt.toISOString(),
          extended: true,
        },
      };
    }

    const grant = await LicenseGrant.create({
      userId: input.userId,
      deviceId: input.deviceId,
      plan: input.plan,
      status: "ACTIVE",
      expiresAt,
      reason: input.reason ?? null,
    });

    return {
      grant: {
        id: grant.id,
        userId: grant.userId,
        deviceId: grant.deviceId,
        plan: grant.plan,
        status: grant.status,
        issuedAt: grant.issuedAt.toISOString(),
        expiresAt: grant.expiresAt.toISOString(),
        extended: false,
      },
    };
  },

  async revokeGrant(input: {
    grantId: string;
    reason?: string;
  }): Promise<{
    grant: { id: string; status: string; revokedAt: string };
  }> {
    const grant = await LicenseGrant.findByPk(input.grantId);
    if (!grant) {
      throw new AppError(404, "License grant not found", "GRANT_NOT_FOUND");
    }
    const now = new Date();
    await grant.update({
      status: "REVOKED",
      revokedAt: now,
      reason: input.reason ?? grant.reason,
    });
    return {
      grant: {
        id: grant.id,
        status: grant.status,
        revokedAt: now.toISOString(),
      },
    };
  },

  async listGrants(input: {
    userId?: string;
    deviceId?: string;
    limit?: number;
  }): Promise<{
    grants: Array<{
      id: string;
      userId: string;
      deviceId: string;
      plan: string;
      status: string;
      issuedAt: string;
      expiresAt: string;
      revokedAt: string | null;
      reason: string | null;
    }>;
  }> {
    const where: Record<string, string> = {};
    if (input.userId) where.userId = input.userId;
    if (input.deviceId) where.deviceId = input.deviceId;

    const grants = await LicenseGrant.findAll({
      where,
      order: [["expiresAt", "DESC"]],
      limit: input.limit ?? 50,
    });

    return {
      grants: grants.map((g) => ({
        id: g.id,
        userId: g.userId,
        deviceId: g.deviceId,
        plan: g.plan,
        status: g.status,
        issuedAt: g.issuedAt.toISOString(),
        expiresAt: g.expiresAt.toISOString(),
        revokedAt: g.revokedAt?.toISOString() ?? null,
        reason: g.reason,
      })),
    };
  },

  async userStatus(input: { userId: string }): Promise<{
    userId: string;
    grants: Array<{
      id: string;
      deviceId: string;
      plan: string;
      status: string;
      expiresAt: string;
      revokedAt: string | null;
    }>;
    devices: Array<{
      deviceId: string;
      deviceName: string;
      status: string;
      plan: string | null;
      state: string;
      active: boolean;
      expiresAt: string;
    }>;
  }> {
    const user = await User.findByPk(input.userId);
    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    const [grants, devices] = await Promise.all([
      LicenseGrant.findAll({
        where: { userId: input.userId },
        order: [["expiresAt", "DESC"]],
        limit: 100,
      }),
      Device.findAll({
        where: { userId: input.userId },
        order: [["createdAt", "DESC"]],
        limit: 50,
      }),
    ]);

    const deviceSummaries = await Promise.all(
      devices.map(async (device) => {
        const entitlement = await resolveEntitlement({
          userId: input.userId,
          deviceId: device.id,
        });
        return {
          deviceId: device.id,
          deviceName: device.deviceName,
          status: device.status,
          plan: entitlement.plan,
          state: entitlement.state,
          active: entitlement.active,
          expiresAt: entitlement.expiresAt.toISOString(),
        };
      }),
    );

    return {
      userId: input.userId,
      grants: grants.map((g) => ({
        id: g.id,
        deviceId: g.deviceId,
        plan: g.plan,
        status: g.status,
        expiresAt: g.expiresAt.toISOString(),
        revokedAt: g.revokedAt?.toISOString() ?? null,
      })),
      devices: deviceSummaries,
    };
  },

  async extendGrant(input: {
    grantId?: string;
    userId?: string;
    deviceId?: string;
    durationDays: number;
    plan?: string;
    reason?: string;
  }): Promise<{
    grant: {
      id: string;
      userId: string;
      deviceId: string;
      plan: string;
      status: string;
      issuedAt: string;
      expiresAt: string;
      extended: boolean;
    };
  }> {
    let userId = input.userId;
    let deviceId = input.deviceId;
    let plan = input.plan ?? "standard";

    if (input.grantId) {
      const existing = await LicenseGrant.findByPk(input.grantId);
      if (!existing) {
        throw new AppError(404, "License grant not found", "GRANT_NOT_FOUND");
      }
      if (existing.status === "REVOKED" || existing.revokedAt) {
        throw new AppError(409, "Cannot extend a revoked license", "GRANT_REVOKED");
      }
      userId = existing.userId;
      deviceId = existing.deviceId;
      plan = input.plan ?? existing.plan;
    }

    if (!userId || !deviceId) {
      throw new AppError(
        400,
        "Provide grantId, or userId and deviceId",
        "VALIDATION_ERROR",
      );
    }

    return this.createGrant({
      userId,
      deviceId,
      plan,
      durationDays: input.durationDays,
      reason: input.reason ?? "admin_extend",
    });
  },
};
