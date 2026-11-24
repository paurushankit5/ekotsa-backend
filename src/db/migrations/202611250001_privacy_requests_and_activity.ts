import type { Migration } from "./types.js";
import { DataTypes } from "./helpers.js";

const TABLE = "privacy_requests";

async function tableExists(queryInterface: Parameters<Migration["up"]>[0]["queryInterface"]) {
  const tables = (await queryInterface.showAllTables()) as Array<string | { tableName: string }>;
  return tables.some((t) => (typeof t === "string" ? t : t.tableName) === TABLE);
}

/**
 * - privacy_requests: Data Principal rights requests and grievances (DPDP Act ss.11–14),
 *   with verification and a 30-day due date tracked for the Grievance Officer.
 * - users.lastActiveAt / inactivityNoticeSentAt: needed to erase inactive accounts after
 *   3 years with 48 hours' notice, as promised in the Privacy Policy.
 */
const migration: Migration = {
  id: "202611250001_privacy_requests_and_activity",
  async up({ queryInterface }) {
    if (!(await tableExists(queryInterface))) {
      await queryInterface.createTable(TABLE, {
        id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
        reference: { type: DataTypes.STRING(20), allowNull: false, unique: true },
        // ACCESS | CORRECTION | ERASURE | WITHDRAW_CONSENT | NOMINATION | GRIEVANCE | OTHER
        type: { type: DataTypes.STRING(32), allowNull: false },
        // SELF | PARENT_GUARDIAN | NOMINEE | AUTHORISED_AGENT
        requesterRole: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "SELF" },
        name: { type: DataTypes.STRING, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
        phone: { type: DataTypes.STRING(40), allowNull: true },
        details: { type: DataTypes.TEXT, allowNull: false },
        // PENDING_VERIFICATION | RECEIVED | IN_PROGRESS | RESOLVED | REJECTED
        status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "PENDING_VERIFICATION" },
        verifyTokenHash: { type: DataTypes.STRING, allowNull: true, unique: true },
        verifiedAt: { type: DataTypes.DATE, allowNull: true },
        acknowledgedAt: { type: DataTypes.DATE, allowNull: true },
        dueAt: { type: DataTypes.DATE, allowNull: true },
        resolvedAt: { type: DataTypes.DATE, allowNull: true },
        resolutionNote: { type: DataTypes.TEXT, allowNull: true },
        handledByAdminId: { type: DataTypes.STRING, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex(TABLE, ["status", "dueAt"]);
      await queryInterface.addIndex(TABLE, ["email"]);
    }

    const users = (await queryInterface.describeTable("users")) as Record<string, unknown>;
    if (!users.lastActiveAt) {
      await queryInterface.addColumn("users", "lastActiveAt", { type: DataTypes.DATE, allowNull: true });
      await queryInterface.sequelize.query(`UPDATE users SET "lastActiveAt" = "updatedAt" WHERE "lastActiveAt" IS NULL`);
    }
    if (!users.inactivityNoticeSentAt) {
      await queryInterface.addColumn("users", "inactivityNoticeSentAt", { type: DataTypes.DATE, allowNull: true });
    }
  },
  async down({ queryInterface }) {
    if (await tableExists(queryInterface)) await queryInterface.dropTable(TABLE);
    const users = (await queryInterface.describeTable("users")) as Record<string, unknown>;
    if (users.lastActiveAt) await queryInterface.removeColumn("users", "lastActiveAt");
    if (users.inactivityNoticeSentAt) await queryInterface.removeColumn("users", "inactivityNoticeSentAt");
  },
};

export default migration;
