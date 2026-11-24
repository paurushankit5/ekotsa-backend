import type { Migration } from "./types.js";
import { DataTypes } from "./helpers.js";

const TABLE = "rate_limit_counters";

async function tableExists(queryInterface: Parameters<Migration["up"]>[0]["queryInterface"]) {
  const tables = (await queryInterface.showAllTables()) as Array<string | { tableName: string }>;
  return tables.some((t) => (typeof t === "string" ? t : t.tableName) === TABLE);
}

/** Fixed-window rate-limit counters (used when Upstash Redis is not configured). */
const migration: Migration = {
  id: "202611240002_rate_limit_counters",
  async up({ queryInterface }) {
    if (await tableExists(queryInterface)) return;
    await queryInterface.createTable(TABLE, {
      key: { type: DataTypes.STRING(255), primaryKey: true, allowNull: false },
      count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      resetAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(TABLE, ["resetAt"]);
  },
  async down({ queryInterface }) {
    if (await tableExists(queryInterface)) await queryInterface.dropTable(TABLE);
  },
};

export default migration;
