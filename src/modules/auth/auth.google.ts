import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError } from "../../middleware/errorHandler.js";
import { getCorsOrigins, loadEnv } from "../../config/env.js";
import { GoogleOAuthTransaction } from "../../db/models/index.js";

const GOOGLE_ISSUER = ["https://accounts.google.com", "accounts.google.com"] as const;
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const DESKTOP_CALLBACK_SCHEMES = new Set(["ekotsa:", "hotel-manager:"]);

export type GoogleOAuthProfile = {
  googleSub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

export type StartGoogleOAuthResult = {
  authorizationUrl: string;
  expiresAt: Date;
  redirectUri: string;
  state: string;
};

export type CompleteGoogleOAuthResult = {
  profile: GoogleOAuthProfile;
  transaction: GoogleOAuthTransaction;
};

function requireGoogleConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUriConfigured: string | undefined;
} {
  const env = loadEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new AppError(
      503,
      "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
      "GOOGLE_OAUTH_NOT_CONFIGURED",
    );
  }
  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUriConfigured: env.GOOGLE_OAUTH_REDIRECT_URI,
  };
}

export function hashGoogleOAuthValue(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

export function googlePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function newGoogleOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

function newGoogleOAuthNonce(): string {
  return randomBytes(32).toString("base64url");
}

function newGooglePkceVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function getGoogleOAuthRedirectUri(origin?: string | null): string {
  const { redirectUriConfigured } = requireGoogleConfig();
  if (redirectUriConfigured) return redirectUriConfigured;

  const env = loadEnv();
  const base = env.APP_PUBLIC_URL?.trim() || origin?.trim();
  if (base) {
    return new URL("/api/v1/oauth/google/callback", base).toString();
  }

  if (env.NODE_ENV === "production") {
    throw new AppError(
      503,
      "GOOGLE_OAUTH_REDIRECT_URI must be configured in production",
      "GOOGLE_OAUTH_NOT_CONFIGURED",
    );
  }

  return new URL("/api/v1/oauth/google/callback", env.FRONTEND_URL).toString();
}

export function normalizeDesktopCallbackUri(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!DESKTOP_CALLBACK_SCHEMES.has(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeBrowserReturnTo(
  value: string | null | undefined,
  origin?: string | null,
): string | null {
  if (!value) return null;
  const raw = value.trim();
  const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (
    !raw ||
    raw.startsWith("//") ||
    raw.startsWith("\\") ||
    (!hasExplicitScheme && raw.includes("\\"))
  ) {
    return null;
  }

  try {
    const env = loadEnv();
    const baseOrigin = origin?.trim() || env.FRONTEND_URL;
    const url = raw.startsWith("/") ? new URL(raw, baseOrigin) : new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;

    const allowedOrigins = new Set([
      ...getCorsOrigins(env),
      new URL(env.FRONTEND_URL).origin,
    ]);
    if (!allowedOrigins.has(url.origin)) return null;
    if (env.NODE_ENV === "production" && url.protocol === "http:") return null;

    return url.toString();
  } catch {
    return null;
  }
}

function buildGoogleAuthorizationUrl(input: {
  state: string;
  nonce: string;
  codeChallenge: string;
  redirectUri: string;
  emailHint?: string | null;
  clientId: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  if (input.emailHint) url.searchParams.set("login_hint", input.emailHint);
  return url.toString();
}

async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ id_token: string }> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.codeVerifier,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        id_token?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok || !payload?.id_token) {
    const message =
      payload?.error_description || payload?.error || "Google token exchange failed.";
    throw new AppError(400, message, "GOOGLE_TOKEN_EXCHANGE_FAILED");
  }

  return { id_token: payload.id_token };
}

async function verifyGoogleIdToken(input: {
  idToken: string;
  nonce: string;
  clientId: string;
}): Promise<GoogleOAuthProfile> {
  const { payload } = await jwtVerify(input.idToken, GOOGLE_JWKS, {
    issuer: [...GOOGLE_ISSUER],
    audience: input.clientId,
  });

  if (typeof payload.nonce !== "string" || payload.nonce !== input.nonce) {
    throw new AppError(400, "Invalid OAuth nonce.", "GOOGLE_NONCE_MISMATCH");
  }

  const email = typeof payload.email === "string" ? payload.email : null;
  const subject = typeof payload.sub === "string" ? payload.sub : null;
  if (!email || !subject) {
    throw new AppError(400, "Google profile is missing an email address.", "GOOGLE_PROFILE_INCOMPLETE");
  }

  return {
    googleSub: subject,
    email: email.trim().toLowerCase(),
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

export async function startGoogleOAuth(input: {
  emailHint?: string | null;
  desktopCallbackUri?: string | null;
  browserReturnTo?: string | null;
  origin?: string | null;
}): Promise<StartGoogleOAuthResult> {
  const { clientId } = requireGoogleConfig();
  const state = newGoogleOAuthState();
  const nonce = newGoogleOAuthNonce();
  const codeVerifier = newGooglePkceVerifier();
  const redirectUri = getGoogleOAuthRedirectUri(input.origin);
  const expiresAt = new Date(Date.now() + TRANSACTION_TTL_MS);
  const desktopCallbackUri = normalizeDesktopCallbackUri(input.desktopCallbackUri);
  const browserReturnTo = normalizeBrowserReturnTo(input.browserReturnTo, input.origin);
  const emailHint = input.emailHint?.trim().toLowerCase() || null;

  await GoogleOAuthTransaction.create({
    provider: "GOOGLE",
    stateHash: hashGoogleOAuthValue(state),
    nonce,
    codeVerifier,
    redirectUri,
    browserReturnTo,
    desktopCallbackUri,
    emailHint,
    expiresAt,
  });

  const authorizationUrl = buildGoogleAuthorizationUrl({
    state,
    nonce,
    codeChallenge: googlePkceChallenge(codeVerifier),
    redirectUri,
    emailHint,
    clientId,
  });

  return { authorizationUrl, expiresAt, redirectUri, state };
}

export async function completeGoogleOAuthCallback(input: {
  code: string;
  state: string;
}): Promise<CompleteGoogleOAuthResult> {
  const { clientId, clientSecret } = requireGoogleConfig();
  const transaction = await GoogleOAuthTransaction.findOne({
    where: { stateHash: hashGoogleOAuthValue(input.state) },
  });

  if (!transaction) {
    throw new AppError(400, "Invalid or expired OAuth state.", "GOOGLE_STATE_INVALID");
  }
  if (transaction.consumedAt) {
    throw new AppError(400, "OAuth state already used.", "GOOGLE_STATE_CONSUMED");
  }
  if (transaction.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, "OAuth request expired.", "GOOGLE_STATE_EXPIRED");
  }
  if (transaction.completedAt) {
    throw new AppError(400, "OAuth callback already processed.", "GOOGLE_CALLBACK_DONE");
  }

  const tokenResponse = await exchangeGoogleAuthorizationCode({
    code: input.code,
    codeVerifier: transaction.codeVerifier,
    redirectUri: transaction.redirectUri,
    clientId,
    clientSecret,
  });

  const profile = await verifyGoogleIdToken({
    idToken: tokenResponse.id_token,
    nonce: transaction.nonce,
    clientId,
  });

  return { profile, transaction };
}

/** @deprecated Prefer startGoogleOAuth / completeGoogleOAuthCallback */
export async function buildGoogleStartUrl(): Promise<string> {
  const started = await startGoogleOAuth({});
  return started.authorizationUrl;
}

/** @deprecated Prefer completeGoogleOAuthCallback */
export async function exchangeGoogleCode(input: {
  code: string;
  state: string;
}): Promise<GoogleOAuthProfile> {
  const { profile } = await completeGoogleOAuthCallback(input);
  return profile;
}
