import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../config/env.js";
import { AppError } from "./errorHandler.js";
import { extractAccessToken, verifySession } from "../modules/auth/auth.crypto.js";

export type UserSessionContext = {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
};

declare global {
  namespace Express {
    interface Request {
      userSession?: UserSessionContext;
      accessToken?: string;
    }
  }
}

async function resolveSession(req: Request) {
  const token = extractAccessToken(req);
  if (!token) return null;
  const session = await verifySession(token);
  if (!session) return null;
  req.accessToken = token;
  return session;
}

export async function requireUserSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const session = await resolveSession(req);
    if (!session) {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }
    req.userSession = session;
    next();
  } catch (error) {
    next(error);
  }
}

/** Attach session when Bearer/cookie JWT present; never 401. */
export async function optionalUserSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const session = await resolveSession(req);
    if (session) req.userSession = session;
    next();
  } catch {
    next();
  }
}

export async function requireAdminSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const session = await resolveSession(req);
    if (!session) {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }
    if (session.role !== "ADMIN") {
      throw new AppError(403, "Admin access required", "FORBIDDEN");
    }
    req.userSession = session;
    next();
  } catch (error) {
    next(error);
  }
}

export function getCookieName() {
  return loadEnv().AUTH_COOKIE_NAME;
}
