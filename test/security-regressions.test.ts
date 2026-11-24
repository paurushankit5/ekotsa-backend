import assert from "node:assert/strict";
import test from "node:test";
import { LocalObjectStorage } from "../src/services/local-object-storage.js";
import { localDemoAdminLoginEnabled, passwordLoginMayIssueSession } from "../src/modules/auth/auth.service.js";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import {
  hashPassword,
  signResetToken,
  signSession,
  verifyPassword,
  verifyResetToken,
  verifySession,
} from "../src/modules/auth/auth.crypto.js";
import { getPublicJwks } from "../src/modules/auth/auth.session-keys.js";

function sessionTestEnv(overrides: Record<string, unknown> = {}) {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    JWT_SECRET: "test-secret-that-is-long-enough",
    AUTH_JWT_KEY_ID: "test_kid",
    AUTH_JWT_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url"),
    AUTH_JWT_ACCEPT_LEGACY_HS256: false,
    ...overrides,
  } as never;
}

async function legacyHs256Session(secret: string, role = "ADMIN") {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: "attacker@example.test", role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("forged")
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(new TextEncoder().encode(secret));
}

test("sessions are ES256-signed with a key id and verify round-trip", async () => {
  const env = sessionTestEnv();
  const token = await signSession({ sub: "user-1", email: "owner@example.test", role: "USER" }, env);
  const header = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString());
  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, "test_kid");
  assert.deepEqual(await verifySession(token, env), { userId: "user-1", email: "owner@example.test", role: "USER" });
});

test("HS256 tokens signed with the shared secret are rejected by default", async () => {
  const env = sessionTestEnv();
  assert.equal(await verifySession(await legacyHs256Session("test-secret-that-is-long-enough"), env), null);
});

test("legacy HS256 bridge only works when explicitly enabled", async () => {
  const env = sessionTestEnv({ AUTH_JWT_ACCEPT_LEGACY_HS256: true });
  const verified = await verifySession(await legacyHs256Session("test-secret-that-is-long-enough", "USER"), env);
  assert.equal(verified?.role, "USER");
});

test("password reset tokens are never accepted as sessions", async () => {
  const env = sessionTestEnv({ AUTH_JWT_ACCEPT_LEGACY_HS256: true });
  const reset = await signResetToken("user-1", "owner@example.test", "otp-1", env);
  assert.equal(await verifySession(reset, env), null);
});

test("tokens signed by a different ES256 key are rejected", async () => {
  const signer = sessionTestEnv();
  const verifier = sessionTestEnv();
  const token = await signSession({ sub: "user-1", email: "owner@example.test", role: "ADMIN" }, signer);
  assert.equal(await verifySession(token, verifier), null);
});

test("published JWKS contains only public key material", () => {
  const jwks = getPublicJwks(sessionTestEnv());
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0]!.kid, "test_kid");
  assert.equal(jwks.keys[0]!.alg, "ES256");
  assert.equal("d" in jwks.keys[0]!, false);
});

test("payment proof upload tokens are single-use and bound to bucket/path", () => {
  const storage = Object.create(LocalObjectStorage.prototype) as LocalObjectStorage;
  const token = storage.issueUploadToken({ bucket: "payment-proofs", path: "user-1/proof-1", ttlMs: 60_000 });

  assert.equal(storage.consumeUploadToken(token, "payment-proofs", "user-1/proof-1"), true);
  assert.equal(storage.consumeUploadToken(token, "payment-proofs", "user-1/proof-1"), false);
  assert.equal(storage.consumeUploadToken(token, "payment-proofs", "user-2/proof-1"), false);
});

test("local object storage rejects paths that escape its root", () => {
  const storage = Object.create(LocalObjectStorage.prototype) as LocalObjectStorage;
  (storage as unknown as { root: string }).root = "D:/Ekotsa/storage";

  assert.throws(() => storage.diskPath("payment-proofs", "../../outside.txt"), /Unsafe storage path/);
  assert.match(storage.diskPath("payment-proofs", "user-1/proof.pdf"), /payment-proofs/);
});

test("password login cannot issue an administrator session without MFA", () => {
  const disabled = { NODE_ENV: "development", LOCAL_DEMO_ADMIN_ENABLED: false, DEMO_ADMIN_CONFIRM_DISPOSABLE: false };
  assert.equal(passwordLoginMayIssueSession("ADMIN", "admin@example.test", disabled), false);
  assert.equal(passwordLoginMayIssueSession("USER", "user@example.test", disabled), true);
});

test("demo ADMIN exception is limited to the fixed local account and explicit flags", () => {
  const enabled = { NODE_ENV: "development", LOCAL_DEMO_ADMIN_ENABLED: true, DEMO_ADMIN_CONFIRM_DISPOSABLE: true };
  assert.equal(localDemoAdminLoginEnabled("demo-admin@ekotsa.test", enabled), true);
  assert.equal(passwordLoginMayIssueSession("ADMIN", "demo-admin@ekotsa.test", enabled), true);
  assert.equal(passwordLoginMayIssueSession("ADMIN", "other@example.test", enabled), false);
  assert.equal(localDemoAdminLoginEnabled("demo-admin@ekotsa.test", { ...enabled, LOCAL_DEMO_ADMIN_ENABLED: false }), false);
  assert.equal(localDemoAdminLoginEnabled("demo-admin@ekotsa.test", { ...enabled, NODE_ENV: "production" }), false);
});

test("demo password accepts the generated secret and rejects an incorrect password", async () => {
  const generated = "local-only-generated-password-9f4f2c3e!";
  const hash = await hashPassword(generated);
  assert.equal(await verifyPassword(generated, hash), true);
  assert.equal(await verifyPassword("incorrect-password", hash), false);
});

test("reset tokens carry a server-side one-use record reference", async () => {
  const env = {
    JWT_SECRET: "test-secret-that-is-long-enough",
  } as never;
  const token = await signResetToken("user-1", "owner@example.test", "otp-1", env);
  assert.deepEqual(await verifyResetToken(token, env), {
    userId: "user-1",
    email: "owner@example.test",
    otpId: "otp-1",
  });
});
