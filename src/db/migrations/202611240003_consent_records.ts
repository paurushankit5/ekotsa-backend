import type { Migration } from "./types.js";
import { DataTypes } from "./helpers.js";

const TABLE = "consent_records";

async function tableExists(queryInterface: Parameters<Migration["up"]>[0]["queryInterface"]) {
  const tables = (await queryInterface.showAllTables()) as Array<string | { tableName: string }>;
  return tables.some((t) => (typeof t === "string" ? t : t.tableName) === TABLE);
}

/**
 * Consent ledger (DPDP Act 2023 s.6(10): the Data Fiduciary must be able to prove consent;
 * s.9 + DPDP Rules r.10: verifiable parental/guardian consent for children under 18).
 */
const migration: Migration = {
  id: "202611240003_consent_records",
  async up({ queryInterface }) {
    if (await tableExists(queryInterface)) return;
    await queryInterface.createTable(TABLE, {
      id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      // USER | REGISTRATION | CONTACT_LEAD
      subjectType: { type: DataTypes.STRING(32), allowNull: false },
      subjectId: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: true },
      purposes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      noticeVersion: { type: DataTypes.STRING(40), allowNull: false },
      // ADULT | MINOR
      ageCategory: { type: DataTypes.STRING(16), allowNull: false },
      marketingConsent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      guardianName: { type: DataTypes.STRING, allowNull: true },
      guardianEmail: { type: DataTypes.STRING, allowNull: true },
      guardianRelationship: { type: DataTypes.STRING(32), allowNull: true },
      // NOT_REQUIRED | PENDING | APPROVED | DECLINED | EXPIRED
      guardianStatus: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "NOT_REQUIRED" },
      guardianTokenHash: { type: DataTypes.STRING, allowNull: true, unique: true },
      guardianTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
      guardianRespondedAt: { type: DataTypes.DATE, allowNull: true },
      ipHash: { type: DataTypes.STRING, allowNull: true },
      userAgent: { type: DataTypes.STRING(512), allowNull: true },
      withdrawnAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex(TABLE, ["subjectType", "subjectId"]);
    await queryInterface.addIndex(TABLE, ["guardianStatus", "guardianTokenExpiresAt"]);
  },
  async down({ queryInterface }) {
    if (await tableExists(queryInterface)) await queryInterface.dropTable(TABLE);
  },
};

export default migration;
