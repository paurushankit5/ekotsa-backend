import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { collectProductionIssues } from "../src/config/production-checks.js";

function strong() {
  return randomBytes(48).toString("base64url");
}

function goodProductionEnv(overrides: Record<string, unknown> = {}) {
  const session = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const licence = generateKeyPairSync("ed25519");
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@ep-prod-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
    CORS_ORIGINS: "https://www.ekotsa.com,https://admin.ekotsa.com",
    FRONTEND_URL: "https://www.ekotsa.com",
    APP_PUBLIC_URL: "https://api.ekotsa.com",
    JWT_SECRET: strong(),
    OTP_PEPPER: strong(),
    DEVICE_TOKEN_PEPPER: strong(),
    CRON_SECRET: strong(),
    AUTH_JWT_KEY_ID: "session_prod_1",
    AUTH_JWT_PRIVATE_KEY: session.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url"),
    AUTH_JWT_ACCEPT_LEGACY_HS256: false,
    LICENSE_SIGNING_KEY_ID: "key_2026_11",
    LICENSE_SIGNING_PRIVATE_KEY: licence.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url"),
    LICENSE_SIGNING_PUBLIC_KEY: licence.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    LOCAL_DEMO_ADMIN_ENABLED: false,
    DEMO_ADMIN_CONFIRM_DISPOSABLE: false,
    GOOGLE_OAUTH_CLIENT_ID: "123-abc.apps.googleusercontent.com",
    GOOGLE_OAUTH_CLIENT_SECRET: strong(),
    GOOGLE_OAUTH_REDIRECT_URI: "https://www.ekotsa.com/api/v1/oauth/google/callback",
    SMTP_HOST: "smtp.gmail.com",
    SMTP_USER: "admin@ekotsa.com",
    SMTP_PASS: strong(),
    SMTP_FROM: "admin@ekotsa.com",
    SMTP_TO: "admin@ekotsa.com",
    R2_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: strong(),
    R2_BUCKET: "ekotsa-downloads",
    TRUST_PROXY_HOPS: 1,
    ...overrides,
  } as never;
}

test("a complete production configuration passes with no errors", () => {
  const { errors } = collectProductionIssues(goodProductionEnv());
  assert.deepEqual(errors, []);
});

test("placeholder secrets, demo admin and localhost URLs are rejected", () => {
  const { errors } = collectProductionIssues(goodProductionEnv({
    JWT_SECRET: "change-me-to-a-long-random-secret-value",
    LOCAL_DEMO_ADMIN_ENABLED: true,
    FRONTEND_URL: "http://localhost:3000",
  }));
  const vars = errors.map((e) => e.variable);
  assert.ok(vars.includes("JWT_SECRET"));
  assert.ok(vars.includes("LOCAL_DEMO_ADMIN_ENABLED"));
  assert.ok(vars.includes("FRONTEND_URL"));
});

test("peppers must be set explicitly and differ from JWT_SECRET", () => {
  const secret = strong();
  const { errors } = collectProductionIssues(goodProductionEnv({ JWT_SECRET: secret, OTP_PEPPER: secret, DEVICE_TOKEN_PEPPER: undefined }));
  const vars = errors.map((e) => e.variable);
  assert.ok(vars.includes("OTP_PEPPER"));
  assert.ok(vars.includes("DEVICE_TOKEN_PEPPER"));
});

test("mismatched licence key pair is rejected", () => {
  const other = generateKeyPairSync("ed25519");
  const { errors } = collectProductionIssues(goodProductionEnv({
    LICENSE_SIGNING_PUBLIC_KEY: other.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
  }));
  assert.ok(errors.some((e) => e.variable === "LICENSE_SIGNING_PUBLIC_KEY"));
});

test("Google redirect must be on the website origin and exact callback path", () => {
  const { errors } = collectProductionIssues(goodProductionEnv({
    GOOGLE_OAUTH_REDIRECT_URI: "https://api.ekotsa.com/v1/oauth/google/callback",
  }));
  assert.ok(errors.filter((e) => e.variable === "GOOGLE_OAUTH_REDIRECT_URI").length >= 2);
});

test("legacy HS256 bridge is not allowed in production", () => {
  const { errors } = collectProductionIssues(goodProductionEnv({ AUTH_JWT_ACCEPT_LEGACY_HS256: true }));
  assert.ok(errors.some((e) => e.variable === "AUTH_JWT_ACCEPT_LEGACY_HS256"));
});
