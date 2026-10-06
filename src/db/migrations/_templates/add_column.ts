/**
 * Copy this file to:
 *   src/db/migrations/YYYYMMDDNNN_short_name.ts
 *
 * Rules:
 * - Filename stem must equal `migration.id`
 * - Prefer queryInterface helpers in ./helpers.js (not raw SQL)
 * - This file is NOT auto-run (name does not match \d+_*.ts)
 */
import type { Migration } from "../types.js";
import {
  DataTypes,
  addColumnIfNotExists,
  removeColumnIfExists,
} from "../helpers.js";

const migration: Migration = {
  id: "YYYYMMDDNNN_short_name",
  async up({ queryInterface }) {
    await addColumnIfNotExists(queryInterface, "some_table", "foo", {
      type: DataTypes.STRING,
      allowNull: true,
    });

    // Other common queryInterface ops:
    // await queryInterface.createTable("other_table", { id: { type: DataTypes.STRING, primaryKey: true } });
    // await queryInterface.addIndex("some_table", ["foo"]);
  },
  async down({ queryInterface }) {
    await removeColumnIfExists(queryInterface, "some_table", "foo");
  },
};

export default migration;
