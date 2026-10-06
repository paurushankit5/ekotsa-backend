import { createHash, randomBytes } from "node:crypto";
import { getDevicePepper, loadEnv, type Env } from "../../config/env.js";

export function newActivationSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function newDeviceAuthToken() {
  return randomBytes(32).toString("base64url");
}

function pepperedHash(value: string, prefix: string, env: Env = loadEnv()) {
  const pepper = getDevicePepper(env);
  return createHash("sha256").update(`${prefix}${value}:${pepper}`).digest("base64url");
}

export function hashActivationSessionToken(token: string, env?: Env) {
  return pepperedHash(token, "", env);
}

export function hashDeviceAuthToken(token: string, env?: Env) {
  return pepperedHash(token, "", env);
}

export function hashDeviceId(deviceId: string, env?: Env) {
  return pepperedHash(deviceId, "", env);
}

export function hashInstallationId(installationId: string, env?: Env) {
  return pepperedHash(installationId, "installation:", env);
}

export function hashDeviceFingerprint(fingerprint: string, env?: Env) {
  return pepperedHash(fingerprint, "fingerprint:", env);
}
