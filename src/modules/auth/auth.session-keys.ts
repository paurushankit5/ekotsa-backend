/**
 * Asymmetric (ES256) keys for user/admin session tokens.
 *
 * The backend alone holds the private key and signs sessions. Every other party (the website
 * middleware, server components) verifies with the PUBLIC keys published at GET /v1/auth/jwks,
 * so a leak from the frontend can no longer be used to forge sessions.
 */
import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import type { Env } from "../../config/env.js";

export const SESSION_JWT_ALG = "ES256";

type SessionKeys = {
  kid: string;
  privateKey: KeyObject;
  /** kid → public key (current + retired keys still accepted). */
  publicKeys: Map<string, KeyObject>;
};

let cache: { fingerprint: string; keys: SessionKeys } | null = null;

function parseKeyMaterial(raw: string, kind: "private" | "public"): KeyObject {
  const value = raw.trim().replace(/\\n/g, "\n");
  if (value.includes("-----BEGIN")) {
    return kind === "private" ? createPrivateKey(value) : createPublicKey(value);
  }
  const der = Buffer.from(value, "base64url");
  return kind === "private"
    ? createPrivateKey({ key: der, format: "der", type: "pkcs8" })
    : createPublicKey({ key: der, format: "der", type: "spki" });
}

function assertEs256(key: KeyObject, label: string) {
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error(`${label} must be an EC P-256 key (ES256). Generate one with: npm run keys:auth`);
  }
}

/** Load (and cache) the session keys; throws with a clear message when not configured. */
export function getSessionKeys(env: Env): SessionKeys {
  const fingerprint = `${env.AUTH_JWT_KEY_ID}|${env.AUTH_JWT_PRIVATE_KEY}|${env.AUTH_JWT_PREVIOUS_PUBLIC_KEYS ?? ""}`;
  if (cache && cache.fingerprint === fingerprint) return cache.keys;

  if (!env.AUTH_JWT_PRIVATE_KEY || !env.AUTH_JWT_KEY_ID) {
    throw new Error("AUTH_JWT_PRIVATE_KEY and AUTH_JWT_KEY_ID are required to sign sessions. Run: npm run keys:auth");
  }
  const privateKey = parseKeyMaterial(env.AUTH_JWT_PRIVATE_KEY, "private");
  assertEs256(privateKey, "AUTH_JWT_PRIVATE_KEY");

  const publicKeys = new Map<string, KeyObject>([[env.AUTH_JWT_KEY_ID, createPublicKey(privateKey)]]);
  if (env.AUTH_JWT_PREVIOUS_PUBLIC_KEYS?.trim()) {
    let previous: Record<string, string>;
    try {
      previous = JSON.parse(env.AUTH_JWT_PREVIOUS_PUBLIC_KEYS) as Record<string, string>;
    } catch {
      throw new Error('AUTH_JWT_PREVIOUS_PUBLIC_KEYS must be JSON like {"kid":"<base64url SPKI>"}');
    }
    for (const [kid, material] of Object.entries(previous)) {
      if (kid === env.AUTH_JWT_KEY_ID || typeof material !== "string") continue;
      const key = parseKeyMaterial(material, "public");
      assertEs256(key, `AUTH_JWT_PREVIOUS_PUBLIC_KEYS[${kid}]`);
      publicKeys.set(kid, key);
    }
  }

  const keys = { kid: env.AUTH_JWT_KEY_ID, privateKey, publicKeys };
  cache = { fingerprint, keys };
  return keys;
}

/** Public JWKS document for verifiers (no private material). */
export function getPublicJwks(env: Env) {
  const { publicKeys } = getSessionKeys(env);
  return {
    keys: [...publicKeys.entries()].map(([kid, key]) => ({
      ...(key.export({ format: "jwk" }) as Record<string, unknown>),
      kid,
      alg: SESSION_JWT_ALG,
      use: "sig",
    })),
  };
}
