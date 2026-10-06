import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Op } from "sequelize";
import { loadEnv } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";
import { AppRelease, type AppReleasePlatform, type AppReleaseStatus } from "../../db/models/AppRelease.js";
import {
  createR2PresignedGetUrl,
  createR2PresignedPutUrl,
  deleteR2Object,
  getR2Config,
  headR2Object,
  isR2Configured,
} from "../../services/r2-storage.js";
import {
  getReleaseManifests as getEnvReleaseManifests,
  toPublicReleaseManifest,
  type Platform,
  type PublicReleaseManifest,
  type ReleaseManifest,
} from "./releases.manifest.js";

/** Soft cap for a single-part browser PUT to R2 (~4.5 GiB; R2 allows ~5 GiB). */
export const MAX_INSTALLER_BYTES = Math.floor(4.5 * 1024 * 1024 * 1024);
const UPLOAD_TTL_SECONDS = 2 * 60 * 60;
const FILE_URL_TTL_SECONDS = 30 * 60;

export type AdminReleaseView = {
  id: string;
  product: string;
  version: string;
  platform: AppReleasePlatform;
  architecture: string;
  status: AppReleaseStatus;
  fileName: string;
  contentType: string;
  installerSize: number;
  sha256: string | null;
  releaseNotesUrl: string | null;
  signingStatus: string;
  minimumSupportedVersion: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  storageProvider: "r2" | "local";
};

function publicBaseUrl() {
  const env = loadEnv();
  return env.APP_PUBLIC_URL ?? `http://localhost:${env.PORT}`;
}

function signingSecret() {
  return loadEnv().JWT_SECRET;
}

function hashToken(token: string) {
  return createHash("sha256").update(`release-upload:${token}`).digest("hex");
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

function toAdminView(row: AppRelease): AdminReleaseView {
  return {
    id: row.id,
    product: row.product,
    version: row.version,
    platform: row.platform,
    architecture: row.architecture,
    status: row.status,
    fileName: row.fileName,
    contentType: row.contentType,
    installerSize: row.installerSize,
    sha256: row.sha256,
    releaseNotesUrl: row.releaseNotesUrl,
    signingStatus: row.signingStatus,
    minimumSupportedVersion: row.minimumSupportedVersion,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    storageProvider: isR2Configured() ? "r2" : "local",
  };
}

async function installerDownloadUrl(row: AppRelease): Promise<string> {
  if (isR2Configured()) {
    return createR2PresignedGetUrl({
      key: row.storagePath,
      fileName: row.fileName,
      expiresInSeconds: FILE_URL_TTL_SECONDS,
    });
  }
  return buildBackendSignedFileUrl(row.id);
}

async function toManifest(row: AppRelease): Promise<ReleaseManifest> {
  const notes =
    row.releaseNotesUrl && /^https?:\/\//i.test(row.releaseNotesUrl)
      ? row.releaseNotesUrl
      : `https://ekotsa.com/releases/${row.version}`;
  return {
    product: row.product,
    channel: row.status === "BETA" ? "beta" : "stable",
    version: row.version,
    platform: row.platform,
    architecture: row.architecture,
    installerUrl: await installerDownloadUrl(row),
    installerSize: row.installerSize,
    sha256: row.sha256 || "0".repeat(64),
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    minimumSupportedVersion: row.minimumSupportedVersion || row.version,
    releaseNotesUrl: notes,
    status:
      row.status === "STABLE" || row.status === "BETA" || row.status === "ARCHIVED"
        ? "ACTIVE"
        : "RETIRED",
    signingStatus: row.signingStatus,
  };
}

export async function toDownloadPublic(row: AppRelease): Promise<
  PublicReleaseManifest & {
    releaseStatus: AppReleaseStatus;
    id: string;
  }
> {
  const base = toPublicReleaseManifest(await toManifest(row));
  return {
    ...base,
    status: row.status === "DELETED" || row.status === "UPLOADING" ? "RETIRED" : "ACTIVE",
    releaseStatus: row.status,
    id: row.id,
  };
}

export function buildBackendSignedFileUrl(releaseId: string, ttlSeconds = FILE_URL_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", signingSecret())
    .update(`${releaseId}:${exp}`)
    .digest("base64url");
  return `${publicBaseUrl()}/v1/releases/files/${encodeURIComponent(releaseId)}?exp=${exp}&sig=${sig}`;
}

/** @deprecated use buildBackendSignedFileUrl — kept for local fallback downloads */
export const buildSignedFileUrl = buildBackendSignedFileUrl;

export function verifySignedFileUrl(releaseId: string, expRaw: string, sig: string) {
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = createHmac("sha256", signingSecret())
    .update(`${releaseId}:${exp}`)
    .digest("base64url");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function softDeleteUploadingRow(row: AppRelease) {
  return row.update({
    status: "DELETED",
    version: `${row.version}__deleted__${row.id.slice(0, 8)}`,
    uploadTokenHash: null,
    uploadExpiresAt: null,
  });
}

async function purgeStaleUploadingSessions() {
  const stale = await AppRelease.findAll({
    where: {
      status: "UPLOADING",
      uploadExpiresAt: { [Op.lt]: new Date() },
    },
    limit: 50,
  });
  for (const row of stale) {
    await softDeleteUploadingRow(row);
  }
}

export const ReleasesService = {
  storageStatus(): {
    provider: "r2" | "none";
    configured: boolean;
    maxBytes: number;
    bucket: string | null;
  } {
    const cfg = getR2Config();
    return {
      provider: cfg ? "r2" : "none",
      configured: Boolean(cfg),
      maxBytes: MAX_INSTALLER_BYTES,
      bucket: cfg?.bucket ?? null,
    };
  },

  async listAdmin(input?: { includeDeleted?: boolean }): Promise<{ releases: AdminReleaseView[] }> {
    const where = input?.includeDeleted
      ? {}
      : { status: { [Op.ne]: "DELETED" as const } };
    const rows = await AppRelease.findAll({
      where,
      order: [
        ["platform", "ASC"],
        ["createdAt", "DESC"],
      ],
    });
    return { releases: rows.map(toAdminView) };
  },

  async listPublic(): Promise<{
    releases: Array<PublicReleaseManifest & { releaseStatus: AppReleaseStatus; id: string }>;
  }> {
    const rows = await AppRelease.findAll({
      where: {
        status: { [Op.in]: ["STABLE", "BETA", "ARCHIVED"] },
        installerSize: { [Op.gt]: 0 },
      },
      order: [
        ["platform", "ASC"],
        ["publishedAt", "DESC"],
        ["createdAt", "DESC"],
      ],
    });
    if (rows.length) {
      return { releases: await Promise.all(rows.map((row) => toDownloadPublic(row))) };
    }

    return {
      releases: getEnvReleaseManifests().map((r) => ({
        ...toPublicReleaseManifest(r),
        releaseStatus: (r.channel === "beta" ? "BETA" : "STABLE") as AppReleaseStatus,
        id: `env:${r.platform}:${r.version}`,
      })),
    };
  },

  async getStableForPlatform(platform: Platform): Promise<ReleaseManifest | null> {
    const row = await AppRelease.findOne({
      where: {
        platform,
        status: "STABLE",
        installerSize: { [Op.gt]: 0 },
      },
      order: [["publishedAt", "DESC"]],
    });
    if (row) return toManifest(row);

    return (
      getEnvReleaseManifests().find(
        (entry) =>
          entry.platform === platform && entry.channel === "stable" && entry.status === "ACTIVE",
      ) ?? null
    );
  },

  async getById(id: string) {
    const row = await AppRelease.findByPk(id);
    if (!row || row.status === "DELETED" || row.status === "UPLOADING") {
      throw new AppError(404, "Release not found", "RELEASE_NOT_FOUND");
    }
    return row;
  },

  /**
   * Creates a DB row and a Cloudflare R2 presigned PUT URL.
   * The browser uploads the file directly to R2 — never through this server.
   */
  async prepareUpload(input: {
    product?: string;
    version: string;
    platform: AppReleasePlatform;
    architecture: string;
    fileName: string;
    contentType?: string;
    size: number;
    releaseNotesUrl?: string | null;
    signingStatus?: "SIGNED" | "UNSIGNED" | "UNKNOWN";
    minimumSupportedVersion?: string | null;
    createdByAdminId?: string | null;
  }): Promise<{
    release: AdminReleaseView;
    upload: {
      url: string;
      method: "PUT";
      headers: Record<string, string>;
      maxBytes: number;
      provider: "r2";
    };
    completeToken: string;
  }> {
    if (!isR2Configured()) {
      throw new AppError(
        503,
        "Cloudflare R2 is required for installer uploads. Add R2_* keys to ekotsa-backend/.env and restart.",
        "R2_NOT_CONFIGURED",
      );
    }
    if (input.size <= 0 || input.size > MAX_INSTALLER_BYTES) {
      throw new AppError(
        400,
        `Installer size must be between 1 byte and ${MAX_INSTALLER_BYTES} bytes (~4.5 GB)`,
        "INSTALLER_SIZE_INVALID",
      );
    }

    const product = (input.product || "Ekotsa Atithi").trim();
    const version = input.version.trim();
    const architecture = input.architecture.trim() || "x64";

    // Drop expired incomplete uploads so a failed prepare→upload can be retried.
    await purgeStaleUploadingSessions();

    const existing = await AppRelease.findOne({
      where: {
        product,
        version,
        platform: input.platform,
        architecture,
        status: { [Op.ne]: "DELETED" },
      },
    });
    if (existing) {
      if (existing.status === "UPLOADING") {
        // Incomplete session still within TTL — replace it so retry works.
        await softDeleteUploadingRow(existing);
      } else {
        throw new AppError(
          409,
          `Version ${version} already exists for ${input.platform}/${architecture}`,
          "RELEASE_VERSION_EXISTS",
        );
      }
    }

    const safeName = sanitizeFileName(input.fileName);
    const contentType = input.contentType || "application/octet-stream";
    const storagePath = `releases/atithi/${input.platform}/${architecture}/${version}/${safeName}`;
    const r2 = getR2Config();
    if (!r2) {
      throw new AppError(
        503,
        "Cloudflare R2 is required for installer uploads. Add R2_* keys (including R2_BUCKET) to ekotsa-backend/.env and restart.",
        "R2_NOT_CONFIGURED",
      );
    }

    const presigned = await createR2PresignedPutUrl({
      key: storagePath,
      contentType,
      expiresInSeconds: UPLOAD_TTL_SECONDS,
    });

    // Opaque completion token (not the R2 signature).
    const completeToken = createHash("sha256")
      .update(`${storagePath}:${Date.now()}:${signingSecret()}`)
      .digest("base64url");

    const row = await AppRelease.create({
      product,
      version,
      platform: input.platform,
      architecture,
      status: "UPLOADING",
      fileName: safeName,
      contentType,
      storageBucket: r2.bucket,
      storagePath,
      installerSize: 0,
      expectedSize: input.size,
      sha256: null,
      releaseNotesUrl: input.releaseNotesUrl ?? null,
      signingStatus: input.signingStatus ?? "UNSIGNED",
      minimumSupportedVersion: input.minimumSupportedVersion ?? version,
      uploadTokenHash: hashToken(completeToken),
      uploadExpiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000),
      publishedAt: null,
      createdByAdminId: input.createdByAdminId ?? null,
    });

    return {
      release: toAdminView(row),
      upload: {
        url: presigned.url,
        method: "PUT",
        headers: presigned.headers,
        maxBytes: MAX_INSTALLER_BYTES,
        provider: "r2",
      },
      completeToken,
    };
  },

  /** After the browser finishes the R2 PUT, verify the object and mark BETA. */
  async completeUpload(input: {
    releaseId: string;
    completeToken: string;
    sha256?: string | null;
  }): Promise<{ release: AdminReleaseView }> {
    if (!isR2Configured()) {
      throw new AppError(503, "Cloudflare R2 is not configured", "R2_NOT_CONFIGURED");
    }

    const row = await AppRelease.findByPk(input.releaseId);
    if (!row || row.status !== "UPLOADING") {
      throw new AppError(404, "Upload session not found", "RELEASE_NOT_FOUND");
    }
    if (row.uploadExpiresAt && row.uploadExpiresAt.getTime() <= Date.now()) {
      throw new AppError(401, "Upload session expired", "UPLOAD_EXPIRED");
    }
    if (row.uploadTokenHash !== hashToken(input.completeToken)) {
      throw new AppError(401, "Upload token invalid", "UPLOAD_UNAUTHORIZED");
    }

    const head = await headR2Object(row.storagePath);
    if (row.expectedSize && head.size > 0 && head.size !== row.expectedSize) {
      throw new AppError(
        400,
        `Uploaded size ${head.size} did not match expected ${row.expectedSize}`,
        "UPLOAD_SIZE_MISMATCH",
      );
    }
    if (head.size <= 0) {
      throw new AppError(400, "Uploaded object is empty", "UPLOAD_EMPTY");
    }

    const sha =
      input.sha256 && /^[a-fA-F0-9]{64}$/.test(input.sha256)
        ? input.sha256.toLowerCase()
        : head.etag
          ? createHash("sha256").update(`etag:${head.etag}`).digest("hex")
          : "0".repeat(64);

    await row.update({
      installerSize: head.size,
      sha256: sha,
      contentType: head.contentType || row.contentType,
      status: "BETA",
      publishedAt: new Date(),
      uploadTokenHash: null,
      uploadExpiresAt: null,
    });

    return { release: toAdminView(await row.reload()) };
  },

  /**
   * Rollback after prepare when the browser/R2 upload fails.
   * Marks the row DELETED so the same version can be uploaded again.
   */
  async abortUpload(input: {
    releaseId: string;
    completeToken?: string | null;
  }): Promise<{ release: AdminReleaseView; aborted: true }> {
    const row = await AppRelease.findByPk(input.releaseId);
    if (!row) throw new AppError(404, "Release not found", "RELEASE_NOT_FOUND");
    if (row.status !== "UPLOADING") {
      // Already completed or cleaned up — treat as success for client retry safety.
      return { release: toAdminView(row), aborted: true };
    }
    if (input.completeToken) {
      if (row.uploadTokenHash !== hashToken(input.completeToken)) {
        throw new AppError(401, "Upload token invalid", "UPLOAD_UNAUTHORIZED");
      }
    }

    // Best-effort: remove a partial object if anything landed in R2.
    if (isR2Configured()) {
      try {
        await deleteR2Object(row.storagePath);
      } catch {
        // ignore — object may never have been written
      }
    }

    await softDeleteUploadingRow(row);
    return { release: toAdminView(await row.reload()), aborted: true };
  },

  async getDownloadable(input: {
    platform: Platform;
    version?: string | null;
  }): Promise<ReleaseManifest | null> {
    const where: Record<string, unknown> = {
      platform: input.platform,
      status: { [Op.in]: ["STABLE", "BETA", "ARCHIVED"] },
      installerSize: { [Op.gt]: 0 },
    };
    if (input.version) where.version = input.version;

    if (!input.version) {
      const stable = await AppRelease.findOne({
        where: { ...where, status: "STABLE" },
        order: [["publishedAt", "DESC"]],
      });
      if (stable) return toManifest(stable);
    }

    const row = await AppRelease.findOne({
      where,
      order: [["publishedAt", "DESC"]],
    });
    if (row) return toManifest(row);

    if (input.version) {
      const envHit = getEnvReleaseManifests().find(
        (entry) =>
          entry.platform === input.platform &&
          entry.version === input.version &&
          entry.status === "ACTIVE",
      );
      return envHit ?? null;
    }
    return this.getStableForPlatform(input.platform);
  },

  async setStatus(input: {
    id: string;
    status: Exclude<AppReleaseStatus, "UPLOADING">;
  }): Promise<{ release: AdminReleaseView }> {
    const row = await AppRelease.findByPk(input.id);
    if (!row) throw new AppError(404, "Release not found", "RELEASE_NOT_FOUND");
    if (row.status === "UPLOADING") {
      throw new AppError(400, "Finish uploading before changing status", "RELEASE_NOT_READY");
    }
    if (input.status === "STABLE") {
      if (row.installerSize <= 0) {
        throw new AppError(400, "Cannot mark incomplete upload as stable", "RELEASE_NOT_READY");
      }
      await AppRelease.update(
        { status: "ARCHIVED" },
        {
          where: {
            platform: row.platform,
            architecture: row.architecture,
            status: "STABLE",
            id: { [Op.ne]: row.id },
          },
        },
      );
      await row.update({ status: "STABLE", publishedAt: row.publishedAt ?? new Date() });
    } else if (input.status === "DELETED") {
      await row.update({
        status: "DELETED",
        version: `${row.version}__deleted__${row.id.slice(0, 8)}`,
      });
    } else {
      await row.update({ status: input.status });
    }
    return { release: toAdminView(await row.reload()) };
  },
};
