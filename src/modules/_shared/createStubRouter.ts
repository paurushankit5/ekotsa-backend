/**
 * Domain module stubs for website → backend migration.
 * See docs/MIGRATION_PLAN.md for API inventory and wave order.
 * Status: stub — no business logic yet.
 */

import { Router } from "express";

export function createStubRouter(domain: string): Router {
  const router = Router();
  router.get("/_status", (_req, res) => {
    res.json({
      ok: true,
      domain,
      status: "stub",
      message: "Module scaffolded; migrate handlers from ekotsa-website /api/v1",
    });
  });
  return router;
}
