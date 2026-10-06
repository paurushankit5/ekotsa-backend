import { createHash, randomBytes } from "node:crypto";
import { Op } from "sequelize";
import { loadEnv, getDevicePepper } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  CustomerRegistration,
  DownloadAuthorization,
  DownloadEvent,
} from "../../db/models/index.js";
import {
  toPublicReleaseManifest,
  type Platform,
  type PublicReleaseManifest,
} from "../releases/releases.manifest.js";
import { ReleasesService } from "../releases/releases.service.js";

const DOWNLOAD_AUTH_TTL_MS = 30 * 60 * 1000;
const DOWNLOAD_AUTH_MAX_USES = 3;

function hashDownloadToken(token: string) {
  const pepper = getDevicePepper(loadEnv());
  return createHash("sha256").update(`download:${token}:${pepper}`).digest("base64url");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

export const DownloadsService = {
  async createSession(input: {
    userId?: string | null;
    registrationId?: string | null;
    platform?: string;
    productCode?: string;
  }): Promise<{
    token: string;
    expiresAt: string;
    remainingUses: number;
  }> {
    let registration: CustomerRegistration | null = null;
    if (input.registrationId) {
      registration = await CustomerRegistration.findByPk(input.registrationId);
    } else if (input.userId) {
      registration = await CustomerRegistration.findOne({
        where: { linkedUserId: input.userId },
      });
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + DOWNLOAD_AUTH_TTL_MS);
    await DownloadAuthorization.create({
      userId: input.userId ?? registration?.linkedUserId ?? null,
      registrationId: registration?.id ?? input.registrationId ?? null,
      organizationId: registration?.organizationId ?? null,
      productCode: input.productCode ?? "ekotsa-os",
      platform: input.platform ?? "*",
      installerVersion: "stable",
      tokenHash: hashDownloadToken(token),
      expiresAt,
      remainingUses: DOWNLOAD_AUTH_MAX_USES,
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      remainingUses: DOWNLOAD_AUTH_MAX_USES,
    };
  },

  /** Lead-gated download: no login required, only a saved registration. */
  async createSessionForRegistration(registrationId: string): Promise<{
    token: string;
    expiresAt: string;
    remainingUses: number;
  }> {
    const registration = await CustomerRegistration.findByPk(registrationId);
    if (!registration) {
      throw new AppError(404, "Registration not found", "REGISTRATION_NOT_FOUND");
    }
    return this.createSession({ registrationId: registration.id });
  },

  async authorize(input: {
    token: string;
    platform: Platform;
    installerVersion?: string | null;
  }): Promise<{
    release: PublicReleaseManifest;
    download: { url: string; remainingUses: number };
  }> {
    const release = await ReleasesService.getDownloadable({
      platform: input.platform,
      version: input.installerVersion ?? null,
    });
    if (!release) {
      throw new AppError(404, "No active release for platform", "RELEASE_NOT_FOUND");
    }
    if (input.installerVersion && input.installerVersion !== release.version) {
      throw new AppError(403, "Requested release does not match", "RELEASE_MISMATCH");
    }
    if (release.status !== "ACTIVE") {
      throw new AppError(403, "Release not available", "RELEASE_UNAVAILABLE");
    }

    const tokenHash = hashDownloadToken(input.token);
    const now = new Date();
    const auth = await DownloadAuthorization.findOne({ where: { tokenHash } });
    if (!auth || auth.revokedAt) {
      throw new AppError(401, "Download authorization invalid", "DOWNLOAD_UNAUTHORIZED");
    }
    if (auth.expiresAt.getTime() <= now.getTime()) {
      throw new AppError(401, "Download authorization expired", "DOWNLOAD_EXPIRED");
    }
    if (auth.platform !== "*" && auth.platform !== input.platform) {
      throw new AppError(403, "Platform not covered", "DOWNLOAD_PLATFORM_MISMATCH");
    }
    if (auth.remainingUses <= 0) {
      throw new AppError(401, "Download authorization exhausted", "DOWNLOAD_EXHAUSTED");
    }

    const [count] = await DownloadAuthorization.update(
      {
        remainingUses: auth.remainingUses - 1,
        lastUsedAt: now,
      },
      {
        where: {
          id: auth.id,
          revokedAt: null,
          expiresAt: { [Op.gt]: now },
          remainingUses: { [Op.gt]: 0 },
        },
      },
    );
    if (count !== 1) {
      throw new AppError(401, "Download authorization no longer valid", "DOWNLOAD_UNAUTHORIZED");
    }

    await DownloadEvent.create({
      registrationId: auth.registrationId,
      userId: auth.userId,
      productCode: auth.productCode,
      installerVersion: release.version,
      platform: release.platform,
      architecture: release.architecture,
      sourcePage: "/download",
      correlationId: auth.id,
    });

    if (auth.registrationId) {
      const reg = await CustomerRegistration.findByPk(auth.registrationId);
      if (reg) {
        await reg.update({
          firstDownloadAt: reg.firstDownloadAt ?? now,
          lastDownloadAt: now,
        });
      }
    }

    return {
      release: toPublicReleaseManifest(release),
      download: {
        url: release.installerUrl,
        remainingUses: auth.remainingUses - 1,
      },
    };
  },

  async recordEvent(input: {
    registrationId?: string | null;
    userId?: string | null;
    productCode?: string | null;
    installerVersion?: string | null;
    platform?: string | null;
    architecture?: string | null;
    sourcePage?: string | null;
    correlationId?: string | null;
  }): Promise<{ downloadEventId: string }> {
    const event = await DownloadEvent.create({
      registrationId: input.registrationId ?? null,
      userId: input.userId ?? null,
      productCode: input.productCode ?? null,
      installerVersion: input.installerVersion ?? null,
      platform: input.platform ?? null,
      architecture: input.architecture ?? null,
      sourcePage: input.sourcePage ?? null,
      correlationId: input.correlationId ?? null,
    });
    return { downloadEventId: event.id };
  },
};
