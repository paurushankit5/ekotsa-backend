import { Op } from "sequelize";
import { loadEnv } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  ActivationSession,
  Device,
  DeviceAuthToken,
  User,
  sequelize,
} from "../../db/models/index.js";
import {
  hashActivationSessionToken,
  hashDeviceAuthToken,
  hashDeviceFingerprint,
  hashDeviceId,
  hashInstallationId,
  newActivationSessionToken,
  newDeviceAuthToken,
} from "./devices.crypto.js";

export type RegisterDeviceInput = {
  activationSessionToken: string;
  deviceId: string;
  installationId?: string;
  deviceFingerprint?: string;
  deviceName: string;
  platform: string;
  osName?: string;
  osVersion?: string;
  architecture?: string;
  appVersion?: string;
  publicKey?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function toUnix(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

export const DeviceService = {
  async createActivationSession(input: {
    userId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ token: string; expiresAt: number; expiresAtIso: string }> {
    const env = loadEnv();
    const token = newActivationSessionToken();
    const expiresAt = new Date(Date.now() + env.ACTIVATION_SESSION_MINUTES * 60 * 1000);

    await ActivationSession.create({
      userId: input.userId,
      sessionTokenHash: hashActivationSessionToken(token),
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });

    return {
      token,
      expiresAt: toUnix(expiresAt),
      expiresAtIso: expiresAt.toISOString(),
    };
  },

  async register(input: RegisterDeviceInput): Promise<{
    device: {
      id: string;
      deviceId: string;
      deviceName: string;
      platform: string;
      appVersion: string | null;
      status: string;
    };
    deviceAuth: {
      token: string;
      expiresAt: number;
      expiresAtIso: string;
    };
  }> {
    const env = loadEnv();
    const now = new Date();
    const sessionTokenHash = hashActivationSessionToken(input.activationSessionToken);

    const session = await ActivationSession.findOne({
      where: { sessionTokenHash },
      include: [{ model: User, as: "user" }],
    });

    if (!session) {
      throw new AppError(401, "Invalid activation session", "ACTIVATION_SESSION_INVALID");
    }
    if (session.consumedAt) {
      throw new AppError(401, "Activation session already used", "ACTIVATION_SESSION_USED");
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new AppError(401, "Activation session expired", "ACTIVATION_SESSION_EXPIRED");
    }

    const deviceIdHash = hashDeviceId(input.deviceId);
    const installationIdHash = input.installationId
      ? hashInstallationId(input.installationId)
      : null;
    const deviceFingerprintHash = input.deviceFingerprint
      ? hashDeviceFingerprint(input.deviceFingerprint)
      : null;
    const metaJson = JSON.stringify({
      ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      clientDeviceId: input.deviceId,
    }).slice(0, 5000);

    const plainToken = newDeviceAuthToken();
    const tokenHash = hashDeviceAuthToken(plainToken);
    const tokenExpiresAt = new Date(
      now.getTime() + env.DEVICE_AUTH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );

    const device = await sequelize.transaction(async (tx) => {
      const consumed = await ActivationSession.update(
        { consumedAt: now },
        {
          where: {
            id: session.id,
            consumedAt: null,
            expiresAt: { [Op.gt]: now },
          },
          transaction: tx,
        },
      );
      if (consumed[0] !== 1) {
        throw new AppError(401, "Activation session already used", "ACTIVATION_SESSION_USED");
      }

      const existing = await Device.findOne({
        where: { deviceIdHash },
        transaction: tx,
        lock: tx.LOCK.UPDATE,
      });

      if (existing && existing.userId !== session.userId) {
        throw new AppError(403, "Device already registered to another account", "DEVICE_OWNED");
      }
      if (existing && existing.status === "REVOKED") {
        throw new AppError(403, "Device is revoked", "DEVICE_REVOKED");
      }

      if (!existing) {
        const activeCount = await Device.count({
          where: { userId: session.userId, status: "ACTIVE" },
          transaction: tx,
        });
        if (activeCount >= env.DEVICE_LIMIT_DEFAULT) {
          throw new AppError(403, "Device limit reached", "DEVICE_LIMIT_REACHED");
        }
      }

      const deviceRecord = existing
        ? await existing.update(
            {
              deviceName: input.deviceName,
              platform: input.platform,
              osName: input.osName ?? null,
              osVersion: input.osVersion ?? null,
              architecture: input.architecture ?? null,
              appVersion: input.appVersion ?? null,
              publicKey: input.publicKey ?? null,
              installationIdHash: installationIdHash ?? existing.installationIdHash,
              deviceFingerprintHash: deviceFingerprintHash ?? existing.deviceFingerprintHash,
              metadataJson: metaJson,
              lastSeenAt: now,
              serverLastSeenAt: now,
            },
            { transaction: tx },
          )
        : await Device.create(
            {
              userId: session.userId,
              deviceIdHash,
              installationIdHash,
              deviceFingerprintHash,
              deviceName: input.deviceName,
              platform: input.platform,
              osName: input.osName ?? null,
              osVersion: input.osVersion ?? null,
              architecture: input.architecture ?? null,
              appVersion: input.appVersion ?? null,
              publicKey: input.publicKey ?? null,
              metadataJson: metaJson,
              status: "ACTIVE",
              lastSeenAt: now,
              serverFirstSeenAt: now,
              serverLastSeenAt: now,
            },
            { transaction: tx },
          );

      await DeviceAuthToken.create(
        {
          deviceId: deviceRecord.id,
          tokenHash,
          expiresAt: tokenExpiresAt,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
        { transaction: tx },
      );

      await User.update(
        { trialStartedAt: now },
        {
          where: { id: session.userId, trialStartedAt: null },
          transaction: tx,
        },
      );

      return deviceRecord;
    });

    return {
      device: {
        id: device.id,
        deviceId: device.id,
        deviceName: device.deviceName,
        platform: device.platform,
        appVersion: device.appVersion,
        status: device.status,
      },
      deviceAuth: {
        token: plainToken,
        expiresAt: toUnix(tokenExpiresAt),
        expiresAtIso: tokenExpiresAt.toISOString(),
      },
    };
  },

  async getMe(deviceId: string, tokenId: string): Promise<{
    deviceId: string;
    deviceName: string;
    platform: string;
    appVersion: string | null;
    status: string;
    metadata: unknown;
    device: {
      id: string;
      deviceName: string;
      platform: string;
      appVersion: string | null;
      status: string;
      lastSeenAt: string | null;
      createdAt: string;
    };
  }> {
    const device = await Device.findByPk(deviceId);
    if (!device) {
      throw new AppError(404, "Device not found", "DEVICE_NOT_FOUND");
    }

    const now = new Date();
    await device.update({ lastSeenAt: now, serverLastSeenAt: now });
    await DeviceAuthToken.update({ lastUsedAt: now }, { where: { id: tokenId } });

    return {
      deviceId: device.id,
      deviceName: device.deviceName,
      platform: device.platform,
      appVersion: device.appVersion,
      status: device.status,
      metadata: device.metadataJson ? safeJson(device.metadataJson) : null,
      device: {
        id: device.id,
        deviceName: device.deviceName,
        platform: device.platform,
        appVersion: device.appVersion,
        status: device.status,
        lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        createdAt: device.createdAt.toISOString(),
      },
    };
  },

  async revoke(input: {
    deviceId: string;
    reason?: string;
  }): Promise<{ revoked: true; deviceId: string }> {
    const device = await Device.findByPk(input.deviceId);
    if (!device) {
      throw new AppError(404, "Device not found", "DEVICE_NOT_FOUND");
    }

    const now = new Date();
    await sequelize.transaction(async (tx) => {
      await device.update(
        {
          status: "REVOKED",
          revokedAt: now,
          revocationReason: input.reason ?? null,
        },
        { transaction: tx },
      );
      await DeviceAuthToken.update(
        { revokedAt: now },
        {
          where: { deviceId: device.id, revokedAt: null },
          transaction: tx,
        },
      );
    });

    return { revoked: true, deviceId: device.id };
  },

  async listAdmin(input: {
    userId?: string;
    limit?: number;
  }): Promise<{
    devices: Array<{
      id: string;
      userId: string;
      userEmail: string | null;
      deviceName: string;
      platform: string;
      appVersion: string | null;
      status: string;
      lastSeenAt: string | null;
      createdAt: string;
      revokedAt: string | null;
    }>;
  }> {
    const where = input.userId ? { userId: input.userId } : {};
    const devices = await Device.findAll({
      where,
      include: [{ model: User, as: "user", attributes: ["email"] }],
      order: [["createdAt", "DESC"]],
      limit: input.limit ?? 500,
    });

    return {
      devices: devices.map((d) => {
        const user = d.get("user") as User | undefined;
        return {
          id: d.id,
          userId: d.userId,
          userEmail: user?.email ?? null,
          deviceName: d.deviceName,
          platform: d.platform,
          appVersion: d.appVersion,
          status: d.status,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          createdAt: d.createdAt.toISOString(),
          revokedAt: d.revokedAt?.toISOString() ?? null,
        };
      }),
    };
  },
};

function safeJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
