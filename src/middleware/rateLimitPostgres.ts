import { QueryTypes } from "sequelize";
import { sequelize } from "../db/sequelize.js";

let lastCleanup = 0;

/**
 * Atomic fixed-window counter in Postgres: one statement increments the key, or restarts the
 * window when it has expired. Returns the hit count in the current window.
 */
export async function postgresRateLimitCount(key: string, windowMs: number): Promise<number> {
  const rows = await sequelize.query<{ count: number }>(
    `INSERT INTO rate_limit_counters ("key", "count", "resetAt")
     VALUES (:key, 1, NOW() + (:windowMs * INTERVAL '1 millisecond'))
     ON CONFLICT ("key") DO UPDATE SET
       "count"   = CASE WHEN rate_limit_counters."resetAt" <= NOW() THEN 1 ELSE rate_limit_counters."count" + 1 END,
       "resetAt" = CASE WHEN rate_limit_counters."resetAt" <= NOW()
                        THEN NOW() + (:windowMs * INTERVAL '1 millisecond')
                        ELSE rate_limit_counters."resetAt" END
     RETURNING "count"`,
    { replacements: { key: key.slice(0, 255), windowMs }, type: QueryTypes.SELECT },
  );
  const count = Number(rows[0]?.count);
  if (!Number.isFinite(count)) throw new Error("RATE_LIMIT_BACKEND_UNAVAILABLE");

  // Opportunistic cleanup of long-expired windows (at most every 10 minutes per process).
  const now = Date.now();
  if (now - lastCleanup > 10 * 60 * 1000) {
    lastCleanup = now;
    void sequelize
      .query(`DELETE FROM rate_limit_counters WHERE "resetAt" < NOW() - INTERVAL '1 hour'`)
      .catch(() => undefined);
  }
  return count;
}
