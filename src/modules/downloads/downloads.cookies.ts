import type { Response } from "express";
import { loadEnv } from "../../config/env.js";

export const DOWNLOAD_AUTH_COOKIE = "ek_download_session";

export function setDownloadSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
) {
  const env = loadEnv();
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(DOWNLOAD_AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}
