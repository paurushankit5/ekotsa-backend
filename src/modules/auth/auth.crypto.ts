import bcrypt from "bcryptjs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import { loadEnv, getOtpPepper, type Env } from "../../config/env.js";
import type { UserRole } from "../../db/models/User.js";

const encoder = new TextEncoder();

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string | null | undefined) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

export function generateOtp() {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

export function hashOtp(otp: string, userId: string, env: Env = loadEnv()) {
  const pepper = getOtpPepper(env);
  return createHash("sha256").update(`${otp}:${userId}:${pepper}`).digest("base64url");
}

export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type SessionClaims = {
  sub: string;
  email: string;
  role: UserRole;
};

export async function signSession(claims: SessionClaims, env: Env = loadEnv()) {
  const maxAgeSeconds = claims.role === "ADMIN" ? 60 * 60 * 12 : 60 * 60 * 24 * 7;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: claims.email, role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + maxAgeSeconds)
    .sign(encoder.encode(env.JWT_SECRET));
}

export async function verifySession(token: string, env: Env = loadEnv()) {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.JWT_SECRET), {
      algorithms: ["HS256"],
    });
    if (!payload.sub || typeof payload.sub !== "string") return null;
    if (typeof payload.email !== "string") return null;
    if (payload.role !== "USER" && payload.role !== "ADMIN") return null;
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

/** Short-lived token after OTP verify, used for reset-password */
export async function signResetToken(userId: string, email: string, env: Env = loadEnv()) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email, purpose: "password_reset" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 15)
    .sign(encoder.encode(env.JWT_SECRET));
}

export async function verifyResetToken(token: string, env: Env = loadEnv()) {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.JWT_SECRET), {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== "password_reset") return null;
    if (!payload.sub || typeof payload.sub !== "string") return null;
    if (typeof payload.email !== "string") return null;
    return { userId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function setSessionCookie(
  res: Response,
  token: string,
  role: UserRole,
  env: Env = loadEnv(),
) {
  const maxAgeSeconds = role === "ADMIN" ? 60 * 60 * 12 : 60 * 60 * 24 * 7;
  res.cookie(env.AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: role === "ADMIN" ? "strict" : "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  });
}

export function clearSessionCookie(res: Response, env: Env = loadEnv()) {
  res.clearCookie(env.AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}

export function publicUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  emailVerified: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}
