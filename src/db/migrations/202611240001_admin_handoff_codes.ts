import type { Migration } from "./types.js";
import { DataTypes } from "./helpers.js";

const TABLE = "admin_handoff_codes";

async function tableExists(queryInterface: Parameters<Migration["up"]>[0]["queryInterface"]) {
  const tables = (await queryInterface.showAllTables()) as Array<string | { tableName: string }>;
  return tables.some((t) => (typeof t === "string" ? t : t.tableName) === TABLE);
}

const migration: Migration = {
  id: "202611240001_admin_handoff_codes",
  async up({ queryInterface }) {
    if (await tableExists(queryInterface)) return;
    await queryInterface.createTable(TABLE, {
      id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      codeHash: { type: DataTypes.STRING, allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      consumedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(TABLE, ["userId"]);
    await queryInterface.addIndex(TABLE, ["expiresAt"]);
  },
  async down({ queryInterface }) {
    if (await tableExists(queryInterface)) await queryInterface.dropTable(TABLE);
  },
};

export default migration;
