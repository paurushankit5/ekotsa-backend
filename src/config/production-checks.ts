/**
 * Production configuration gate. When NODE_ENV=production the server refuses to start if any
 * error below is found (see server.ts); `npm run check:env:production` runs the same checks.
 */
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { getCorsOrigins, type Env } from "./env.js";
import { getSessionKeys } from "../modules/auth/auth.session-keys.js";

export type ConfigIssue = { variable: string; message: string };

const PLACEHOLDER = /change-?me|placeholder|example|your[-_]|dummy|test[-_]?secret|^secret$|^password$|^<.*>$/i;

function isLocalHost(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(hostname) || hostname.endsWith(".localhost");
}

function decodeKey(value: string) {
  const trimmed = value.trim().replace(/\\n/g, "\n");
  if (trimmed.includes("BEGIN")) return { pem: trimmed };
  return { der: Buffer.from(trimmed, "base64url") };
}

export function collectProductionIssues(env: Env): { errors: ConfigIssue[]; warnings: ConfigIssue[] } {
  const errors: ConfigIssue[] = [];
  const warnings: ConfigIssue[] = [];
  const err = (variable: string, message: string): void => void errors.push({ variable, message });
  const warn = (variable: string, message: string): void => void warnings.push({ variable, message });
  const raw = env as unknown as Record<string, unknown>;

  // --- Secrets: strong, explicit, not placeholders ---
  const strong = (name: string, min: number) => {
    const value = String(raw[name] ?? "");
    if (!value) return err(name, "is required in production");
    if (value.length < min) err(name, `must be at least ${min} characters`);
    if (PLACEHOLDER.test(value)) err(name, "looks like a placeholder — generate a real random value");
  };
  strong("JWT_SECRET", 32);
  strong("OTP_PEPPER", 32); // otherwise falls back to JWT_SECRET
  strong("DEVICE_TOKEN_PEPPER", 32); // otherwise falls back to JWT_SECRET
  strong("CRON_SECRET", 24);
  if (env.OTP_PEPPER && env.OTP_PEPPER === env.JWT_SECRET) err("OTP_PEPPER", "must differ from JWT_SECRET");
  if (env.DEVICE_TOKEN_PEPPER && env.DEVICE_TOKEN_PEPPER === env.JWT_SECRET) err("DEVICE_TOKEN_PEPPER", "must differ from JWT_SECRET");

  // --- Session signing keys (ES256) ---
  try {
    getSessionKeys(env);
  } catch (e) {
    err("AUTH_JWT_PRIVATE_KEY", e instanceof Error ? e.message : String(e));
  }
  if (env.AUTH_JWT_ACCEPT_LEGACY_HS256) err("AUTH_JWT_ACCEPT_LEGACY_HS256", "must be false in production");

  // --- Licence signing keys (Ed25519) must exist and form a matching pair ---
  if (!env.LICENSE_SIGNING_KEY_ID || !env.LICENSE_SIGNING_PRIVATE_KEY || !env.LICENSE_SIGNING_PUBLIC_KEY) {
    err("LICENSE_SIGNING_*", "LICENSE_SIGNING_KEY_ID, _PRIVATE_KEY and _PUBLIC_KEY are required (npm run keys:license)");
  } else {
    if (/dev/i.test(env.LICENSE_SIGNING_KEY_ID)) err("LICENSE_SIGNING_KEY_ID", "looks like a development key id — use a production key");
    try {
      const priv = decodeKey(env.LICENSE_SIGNING_PRIVATE_KEY);
      const pub = decodeKey(env.LICENSE_SIGNING_PUBLIC_KEY);
      const privateKey = priv.pem ? createPrivateKey(priv.pem) : createPrivateKey({ key: priv.der!, format: "der", type: "pkcs8" });
      const publicKey = pub.pem ? createPublicKey(pub.pem) : createPublicKey({ key: pub.der!, format: "der", type: "spki" });
      const probe = Buffer.from("ekotsa-license-keypair-check");
      if (!verify(null, probe, publicKey, sign(null, probe, privateKey))) {
        err("LICENSE_SIGNING_PUBLIC_KEY", "does not match LICENSE_SIGNING_PRIVATE_KEY");
      }
    } catch {
      err("LICENSE_SIGNING_PRIVATE_KEY", "could not be parsed as an Ed25519 key pair");
    }
  }

  // --- Development-only switches must be off ---
  if (env.LOCAL_DEMO_ADMIN_ENABLED) err("LOCAL_DEMO_ADMIN_ENABLED", "must be false in production");
  if (env.DEMO_ADMIN_CONFIRM_DISPOSABLE) err("DEMO_ADMIN_CONFIRM_DISPOSABLE", "must be false in production");
  if (process.env.ALLOW_DEV_MEMORY_RATE_LIMIT === "true" || process.env.RATE_LIMIT_STORE === "memory") {
    err("RATE_LIMIT_STORE", "in-memory rate limiting is not allowed in production");
  }

  // --- URLs / origins ---
  const httpsPublic = (name: string, value: string | undefined): URL | undefined => {
    if (!value) {
      err(name, "is required in production");
      return undefined;
    }
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") err(name, "must use https");
      if (isLocalHost(url.hostname)) err(name, "must not point at localhost");
      return url;
    } catch {
      err(name, "must be a valid URL");
    }
    return undefined;
  };
  const frontend = httpsPublic("FRONTEND_URL", env.FRONTEND_URL);
  httpsPublic("APP_PUBLIC_URL", env.APP_PUBLIC_URL);

  const origins = getCorsOrigins(env);
  if (!origins.length) err("CORS_ORIGINS", "is required in production");
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.protocol !== "https:" || isLocalHost(url.hostname)) err("CORS_ORIGINS", `${origin} must be an https, non-localhost origin`);
    } catch {
      err("CORS_ORIGINS", `${origin} is not a valid origin`);
    }
  }
  if (frontend && !origins.includes(frontend.origin)) err("CORS_ORIGINS", `must include FRONTEND_URL origin ${frontend.origin}`);

  try {
    const db = new URL(env.DATABASE_URL);
    if (isLocalHost(db.hostname)) err("DATABASE_URL", "must not point at localhost in production");
  } catch {
    err("DATABASE_URL", "must be a valid connection URL");
  }

  // --- Google sign-in ---
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) err("GOOGLE_OAUTH_CLIENT_ID/SECRET", "are required (admin and desktop sign-in)");
  const redirect = httpsPublic("GOOGLE_OAUTH_REDIRECT_URI", env.GOOGLE_OAUTH_REDIRECT_URI);
  if (redirect && frontend && redirect.origin !== frontend.origin) {
    err("GOOGLE_OAUTH_REDIRECT_URI", `must use the website origin ${frontend.origin} (the website proxies /api/v1)`);
  }
  if (redirect && redirect.pathname !== "/api/v1/oauth/google/callback") {
    err("GOOGLE_OAUTH_REDIRECT_URI", "path must be /api/v1/oauth/google/callback");
  }

  // --- Email (OTP, password reset, contact notifications) ---
  for (const name of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
    if (!raw[name]) err(name, "is required in production (otherwise emails are only printed to the console)");
  }
  if (!raw.SMTP_TO) warn("SMTP_TO", "not set — contact-form notifications have no recipient");

  // --- Installer storage (Cloudflare R2) ---
  for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
    if (!raw[name]) err(name, "is required in production (installer uploads/downloads)");
  }
  if (env.R2_BUCKET && /dev/i.test(String(env.R2_BUCKET))) warn("R2_BUCKET", "looks like a development bucket");

  // --- Rate limiting store ---
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    warn("RATE_LIMIT_STORE", "using the Postgres rate-limit table (rate_limit_counters) — run migrations before deploy");
  }

  // --- Reverse proxy ---
  if (env.TRUST_PROXY_HOPS < 1) {
    warn("TRUST_PROXY_HOPS", "is 0 — behind a load balancer/proxy set it to the number of hops, or every client shares one rate-limit key");
  }

  return { errors, warnings };
}
