import { Joi } from "../../utils/validate.js";
import { loadEnv } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";

export type Platform = "windows" | "macos" | "linux";

export type ReleaseManifest = {
  product: string;
  channel: string;
  version: string;
  platform: Platform;
  architecture: string;
  installerUrl: string;
  installerSize: number;
  sha256: string;
  publishedAt: string;
  minimumSupportedVersion: string;
  releaseNotesUrl: string;
  status: "ACTIVE" | "RETIRED" | "REVOKED";
  signingStatus: "SIGNED" | "UNSIGNED" | "UNKNOWN";
  updaterSignature?: string | null;
};

export type PublicReleaseManifest = Omit<ReleaseManifest, "installerUrl"> & {
  downloadProtected: true;
};

const releaseSchema = Joi.object({
  product: Joi.string().min(1).max(80).required(),
  channel: Joi.string().min(1).required(),
  version: Joi.string()
    .pattern(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
    .required(),
  platform: Joi.string().valid("windows", "macos", "linux").required(),
  architecture: Joi.string().min(1).required(),
  installerUrl: Joi.string()
    .uri({ scheme: ["https"] })
    .required(),
  installerSize: Joi.number().integer().min(0).required(),
  sha256: Joi.string()
    .pattern(/^[a-fA-F0-9]{64}$/)
    .required(),
  publishedAt: Joi.string().isoDate().required(),
  minimumSupportedVersion: Joi.string()
    .pattern(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
    .required(),
  releaseNotesUrl: Joi.string()
    .uri({ scheme: ["https"] })
    .required(),
  status: Joi.string().valid("ACTIVE", "RETIRED", "REVOKED").default("ACTIVE"),
  signingStatus: Joi.string().valid("SIGNED", "UNSIGNED", "UNKNOWN").default("UNKNOWN"),
  updaterSignature: Joi.string().max(4096).allow(null).optional(),
});

export function getReleaseManifests(): ReleaseManifest[] {
  const env = loadEnv();
  const raw = env.APP_RELEASE_MANIFEST_JSON;
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError(500, "APP_RELEASE_MANIFEST_JSON is invalid JSON", "RELEASE_MANIFEST_INVALID");
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  const releases: ReleaseManifest[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const { error, value } = releaseSchema.validate(item, {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      throw new AppError(
        500,
        `Invalid release manifest: ${error.details.map((d) => d.message).join("; ")}`,
        "RELEASE_MANIFEST_INVALID",
      );
    }
    const key = `${value.channel}:${value.platform}:${value.architecture}`;
    if (seen.has(key)) {
      throw new AppError(500, `Duplicate release for ${key}`, "RELEASE_MANIFEST_INVALID");
    }
    seen.add(key);
    releases.push(value as ReleaseManifest);
  }

  return releases;
}

export function getReleaseManifestForPlatform(platform: Platform) {
  return (
    getReleaseManifests().find(
      (entry) => entry.platform === platform && entry.channel === "stable" && entry.status === "ACTIVE",
    ) ?? null
  );
}

export function toPublicReleaseManifest(release: ReleaseManifest): PublicReleaseManifest {
  const { installerUrl: _url, ...rest } = release;
  return { ...rest, downloadProtected: true };
}
