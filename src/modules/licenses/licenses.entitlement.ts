import { Device, LicenseGrant, User } from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { loadEnv } from "../../config/env.js";
import {
  getGraceDays,
  getMaxOfflineDays,
  getTrialDays,
  type ArtifactStatus,
} from "../../services/license-artifacts.js";

export type EntitlementSource = "grant" | "trial" | "none";

export type EntitlementState =
  | "PAID_ACTIVE"
  | "TRIAL_ACTIVE"
  | "GRACE"
  | "EXPIRED"
  | "REVOKED"
  | "SUSPENDED"
  | "NOT_ACTIVATED"
  | "DEVICE_BLOCKED";

export type EntitlementSnapshot = {
  state: EntitlementState;
  source: EntitlementSource;
  active: boolean;
  plan: string | null;
  licenseId: string | null;
  /** Internal Device.id (cuid) */
  deviceId: string;
  /** Client fingerprint Atithi binds to (from register); falls back to deviceId */
  clientDeviceId: string;
  userId: string;
  expiresAt: Date;
  graceUntil: Date;
  maxOfflineUntil: Date;
  trialUntil: Date | null;
  trialStartedAt: Date | null;
  artifactStatus: ArtifactStatus;
  serverTime: Date;
};

function clientDeviceIdFrom(device: Device): string {
  if (!device.metadataJson) return device.id;
  try {
    const meta = JSON.parse(device.metadataJson) as { clientDeviceId?: unknown };
    if (typeof meta.clientDeviceId === "string" && meta.clientDeviceId.trim()) {
      return meta.clientDeviceId.trim();
    }
  } catch {
    /* ignore */
  }
  return device.id;
}

function addDays(from: Date, days: number) {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function resolveEntitlement(input: {
  userId: string;
  deviceId: string;
  now?: Date;
}): Promise<EntitlementSnapshot> {
  const now = input.now ?? new Date();
  const env = loadEnv();
  const graceDays = getGraceDays(env);
  const maxOfflineDays = getMaxOfflineDays(env);
  const trialDays = getTrialDays(env);
  const maxOfflineUntil = addDays(now, maxOfflineDays);

  const [device, user, grant] = await Promise.all([
    Device.findByPk(input.deviceId),
    User.findByPk(input.userId),
    LicenseGrant.findOne({
      where: { userId: input.userId, deviceId: input.deviceId },
      order: [["expiresAt", "DESC"]],
    }),
  ]);

  if (!device || !user) {
    throw new AppError(404, "Device or user not found", "NOT_FOUND");
  }

  const clientDeviceId = clientDeviceIdFrom(device);

  if (device.status === "REVOKED" || device.revokedAt) {
    const expiresAt = grant?.expiresAt ?? now;
    return {
      state: "DEVICE_BLOCKED",
      source: grant ? "grant" : "none",
      active: false,
      plan: grant?.plan ?? null,
      licenseId: grant?.id ?? null,
      deviceId: device.id,
      clientDeviceId,
      userId: user.id,
      expiresAt,
      graceUntil: addDays(expiresAt, graceDays),
      maxOfflineUntil,
      trialUntil: null,
      trialStartedAt: user.trialStartedAt,
      artifactStatus: "REVOKED",
      serverTime: now,
    };
  }

  if (grant) {
    const revoked = grant.status === "REVOKED" || !!grant.revokedAt;
    const suspended = grant.status === "SUSPENDED" || !!grant.suspendedAt;
    const graceUntil = addDays(grant.expiresAt, graceDays);
    const paidActive = grant.expiresAt.getTime() > now.getTime();
    const inGrace = !paidActive && graceUntil.getTime() > now.getTime();

    let state: EntitlementState;
    let artifactStatus: ArtifactStatus;
    if (revoked) {
      state = "REVOKED";
      artifactStatus = "REVOKED";
    } else if (suspended) {
      state = "SUSPENDED";
      artifactStatus = "REVOKED";
    } else if (paidActive) {
      state = "PAID_ACTIVE";
      artifactStatus = "ACTIVE";
    } else if (inGrace) {
      state = "GRACE";
      artifactStatus = "GRACE";
    } else {
      state = "EXPIRED";
      artifactStatus = "EXPIRED";
    }

    return {
      state,
      source: "grant",
      active: state === "PAID_ACTIVE" || state === "GRACE",
      plan: grant.plan,
      licenseId: grant.id,
      deviceId: device.id,
      clientDeviceId,
      userId: user.id,
      expiresAt: grant.expiresAt,
      graceUntil,
      maxOfflineUntil,
      trialUntil: null,
      trialStartedAt: user.trialStartedAt,
      artifactStatus,
      serverTime: now,
    };
  }

  if (user.trialStartedAt) {
    const trialUntil = addDays(user.trialStartedAt, trialDays);
    const graceUntil = addDays(trialUntil, graceDays);
    const trialActive = trialUntil.getTime() > now.getTime();
    const inGrace = !trialActive && graceUntil.getTime() > now.getTime();

    const state: EntitlementState = trialActive
      ? "TRIAL_ACTIVE"
      : inGrace
        ? "GRACE"
        : "EXPIRED";
    const artifactStatus: ArtifactStatus = trialActive
      ? "ACTIVE"
      : inGrace
        ? "GRACE"
        : "EXPIRED";

    return {
      state,
      source: "trial",
      active: state === "TRIAL_ACTIVE" || state === "GRACE",
      plan: "trial",
      licenseId: `trial:${user.id}`,
      deviceId: device.id,
      clientDeviceId,
      userId: user.id,
      expiresAt: trialUntil,
      graceUntil,
      maxOfflineUntil,
      trialUntil,
      trialStartedAt: user.trialStartedAt,
      artifactStatus,
      serverTime: now,
    };
  }

  return {
    state: "NOT_ACTIVATED",
    source: "none",
    active: false,
    plan: null,
    licenseId: null,
    deviceId: device.id,
    clientDeviceId,
    userId: user.id,
    expiresAt: now,
    graceUntil: now,
    maxOfflineUntil,
    trialUntil: null,
    trialStartedAt: null,
    artifactStatus: "EXPIRED",
    serverTime: now,
  };
}
