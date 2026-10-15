import { createStubRouter } from "../_shared/createStubRouter.js";

/**
 * Cross-cutting platform concerns (rate-limit, audit, idempotency hooks).
 * Internal cron routes will live under /v1/internal once migrated.
 */
export const platformRouter = createStubRouter("platform");
