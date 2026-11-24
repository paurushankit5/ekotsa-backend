import type { NextFunction, Request, Response } from "express";
import { postgresRateLimitCount } from "./rateLimitPostgres.js";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
};

type Counter = { count: number; resetAt: number };
type Store = "upstash" | "postgres" | "memory";

const counters = new Map<string, Counter>();

function clientKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

/** In-memory counting is per-process and never used in production. */
function memoryAllowed() {
  const ciTest = process.env.NODE_ENV === "test" && process.env.INTEGRATION_TEST_MODE === "true" &&
    process.env.CI === "1" && process.env.ALLOW_INSECURE_RATE_LIMIT_FALLBACK === "true";
  // Local development only: explicit opt-in (RATE_LIMIT_STORE=memory, or the older flag).
  const localDev = process.env.NODE_ENV === "development" &&
    (process.env.RATE_LIMIT_STORE === "memory" || process.env.ALLOW_DEV_MEMORY_RATE_LIMIT === "true");
  return ciTest || localDev;
}

/**
 * Store selection: Upstash Redis when configured; otherwise the shared Postgres counter table
 * (default, including production); in-memory only for CI tests / explicit local opt-in.
 */
function selectStore(): Store {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return "upstash";
  if (memoryAllowed()) return "memory";
  return "postgres";
}

async function redisCount(key: string, windowMs: number): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("RATE_LIMIT_BACKEND_UNAVAILABLE");
  const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["INCR", key], ["EXPIRE", key, Math.ceil(windowMs / 1000)]]),
  });
  if (!response.ok) throw new Error("RATE_LIMIT_BACKEND_UNAVAILABLE");
  const result = await response.json() as Array<{ result?: number }>;
  const count = Number(result?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error("RATE_LIMIT_BACKEND_UNAVAILABLE");
  return count;
}

function memoryCount(key: string, windowMs: number): number {
  const now = Date.now();
  const current = counters.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  entry.count += 1;
  counters.set(key, entry);
  if (counters.size > 10_000) {
    for (const [storedKey, stored] of counters) {
      if (stored.resetAt <= now) counters.delete(storedKey);
    }
  }
  return entry.count;
}

export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${options.keyPrefix}:${clientKey(req)}`;
    let count: number;
    try {
      const store = selectStore();
      count = store === "upstash"
        ? await redisCount(key, options.windowMs)
        : store === "postgres"
          ? await postgresRateLimitCount(key, options.windowMs)
          : memoryCount(key, options.windowMs);
    } catch {
      // Fail closed: never serve rate-limited endpoints without a working limiter.
      res.status(503).json({ ok: false, error: "Rate limiting is temporarily unavailable." });
      return;
    }

    if (count > options.max) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil(options.windowMs / 1000)));
      res.status(429).json({ ok: false, error: "Too many requests. Please try again shortly." });
      return;
    }
    next();
  };
}
