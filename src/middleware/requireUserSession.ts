import type { NextFunction, Request, Response } from "express";
import { loadEnv } from "../config/env.js";
import { AppError } from "./errorHandler.js";
import { verifySession } from "../modules/auth/auth.crypto.js";

export type UserSessionContext = {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
};

declare global {
  namespace Express {
    interface Request {
      userSession?: UserSessionContext;
    }
  }
}

export async function requireUserSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const env = loadEnv();
    const token = req.cookies?.[env.AUTH_COOKIE_NAME] as string | undefined;
    if (!token) {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }
    const session = await verifySession(token);
    if (!session) {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }
    req.userSession = session;
    next();
  } catch (error) {
    next(error);
  }
}

/** Attach session when cookie present; never 401. */
export async function optionalUserSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const env = loadEnv();
    const token = req.cookies?.[env.AUTH_COOKIE_NAME] as string | undefined;
    if (token) {
      const session = await verifySession(token);
      if (session) req.userSession = session;
    }
    next();
  } catch {
    next();
  }
}

export async function requireAdminSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const env = loadEnv();
    const token = req.cookies?.[env.AUTH_COOKIE_NAME] as string | undefined;
    if (!token) {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }
    const session = await verifySession(token);
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
