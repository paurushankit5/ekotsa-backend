import type { Migration } from "./types.js";

/**
 * Initial schema bootstrap for empty databases.
 *
 * Creates any tables defined by Sequelize models that do not exist yet.
 * Does NOT alter existing tables (no column diffs) — later numbered migrations
 * own additive/destructive changes.
 *
 * Safe on databases that were previously created with db:sync: missing tables
 * are created; existing tables are left alone.
 */
const migration: Migration = {
  id: "202604070000_baseline_schema",
  async up({ sequelize }) {
    // Ensure all models are registered before sync.
    await import("../models/index.js");
    await sequelize.sync({ force: false, alter: false });
  },
};

export default migration;
