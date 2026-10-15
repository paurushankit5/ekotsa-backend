import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
import { loadEnv, type Env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

export type ArtifactStatus = "ACTIVE" | "GRACE" | "EXPIRED" | "REVOKED";

export type LicenseArtifactV1Payload = {
  v: 1;
  iss: "ekotsa";
  issuerVersion: number;
  kid: string;
  sigAlg: "Ed25519";
  licenseId: string;
  userId: string;
  deviceId: string;
  plan: string | null;
  status: ArtifactStatus;
  /** Unix seconds — Atithi EntitlementMetadata expects i64, not ISO strings */
  issuedAt: number;
  expiresAt: number;
  graceUntil: number;
  maxOfflineUntil: number;
  /** Present for trial; null for paid so Atithi uses paid path */
  trialUntil?: number | null;
  features: string[] | null;
};

export type SignedLicenseArtifactV1 = {
  payload: LicenseArtifactV1Payload;
  payloadHash: string;
  signature: string;
};

export function getGraceDays(env: Env = loadEnv()) {
  return env.LICENSE_GRACE_DAYS;
}

export function getMaxOfflineDays(env: Env = loadEnv()) {
  return env.LICENSE_MAX_OFFLINE_DAYS;
}

export function getTrialDays(env: Env = loadEnv()) {
  return env.LICENSE_TRIAL_DAYS;
}

export function canonicalJson(value: unknown) {
  const seen = new WeakSet();
  const normalize = (v: unknown): unknown => {
    if (v && typeof v === "object") {
      if (seen.has(v as object)) return null;
      seen.add(v as object);
      if (Array.isArray(v)) return v.map((item) => normalize(item));
      const keys = Object.keys(v as Record<string, unknown>).sort();
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = normalize((v as Record<string, unknown>)[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(normalize(value));
}

export function sha256Base64Url(inputUtf8: string) {
  return createHash("sha256").update(inputUtf8).digest("base64url");
}

function decodeKeyMaterial(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN")) return trimmed;
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function requireSigningConfig(env: Env = loadEnv()) {
  if (!env.LICENSE_SIGNING_KEY_ID || !env.LICENSE_SIGNING_PRIVATE_KEY || !env.LICENSE_SIGNING_PUBLIC_KEY) {
    throw new AppError(
      503,
      "License signing is not configured. Set LICENSE_SIGNING_KEY_ID, LICENSE_SIGNING_PRIVATE_KEY, LICENSE_SIGNING_PUBLIC_KEY.",
      "LICENSE_SIGNING_NOT_CONFIGURED",
    );
  }
  return {
    kid: env.LICENSE_SIGNING_KEY_ID,
    privateKey: env.LICENSE_SIGNING_PRIVATE_KEY,
    publicKey: env.LICENSE_SIGNING_PUBLIC_KEY,
    issuerVersion: env.LICENSE_ISSUER_VERSION,
  };
}

export function signLicenseArtifact(
  payloadInput: Omit<
    LicenseArtifactV1Payload,
    "v" | "iss" | "issuerVersion" | "sigAlg" | "kid"
  >,
  env: Env = loadEnv(),
): SignedLicenseArtifactV1 {
  const signing = requireSigningConfig(env);
  const payload: LicenseArtifactV1Payload = {
    v: 1,
    iss: "ekotsa",
    issuerVersion: signing.issuerVersion,
    kid: signing.kid,
    sigAlg: "Ed25519",
    ...payloadInput,
  };

  const canonical = canonicalJson(payload);
  const payloadHash = sha256Base64Url(canonical);
  const privRaw = decodeKeyMaterial(signing.privateKey);
  const privateKey =
    typeof privRaw === "string"
      ? createPrivateKey(privRaw)
      : createPrivateKey({ key: privRaw, format: "der", type: "pkcs8" });
  const sig = nodeSign(null, Buffer.from(payloadHash, "utf8"), privateKey);

  return {
    payload,
    payloadHash,
    signature: sig.toString("base64url"),
  };
}

export function verifyLicenseArtifact(
  artifact: SignedLicenseArtifactV1,
  env: Env = loadEnv(),
): boolean {
  const signing = requireSigningConfig(env);
  const canonical = canonicalJson(artifact.payload);
  if (sha256Base64Url(canonical) !== artifact.payloadHash) return false;

  const pubRaw = decodeKeyMaterial(signing.publicKey);
  const publicKey =
    typeof pubRaw === "string"
      ? createPublicKey(pubRaw)
      : createPublicKey({ key: pubRaw, format: "der", type: "spki" });

  return nodeVerify(
    null,
    Buffer.from(artifact.payloadHash, "utf8"),
    publicKey,
    Buffer.from(artifact.signature, "base64url"),
  );
}

/** Dev helper — generate PEM key pair for .env */
export function generateEd25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyBase64Url: Buffer.from(
      privateKey.export({ type: "pkcs8", format: "der" }) as Buffer,
    ).toString("base64url"),
    publicKeyBase64Url: Buffer.from(
      publicKey.export({ type: "spki", format: "der" }) as Buffer,
    ).toString("base64url"),
  };
}
