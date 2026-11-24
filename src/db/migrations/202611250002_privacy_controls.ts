import type { Migration } from "./types.js";
import { DataTypes } from "./helpers.js";
import { hashDeviceFingerprint, hashInstallationId } from "../../modules/devices/devices.crypto.js";

type QI = Parameters<Migration["up"]>[0]["queryInterface"];

async function tableExists(queryInterface: QI, table: string) {
  const tables = (await queryInterface.showAllTables()) as Array<string | { tableName: string }>;
  return tables.some((t) => (typeof t === "string" ? t : t.tableName) === table);
}

async function addColumns(queryInterface: QI, table: string, columns: Record<string, object>) {
  const existing = (await queryInterface.describeTable(table)) as Record<string, unknown>;
  for (const [name, spec] of Object.entries(columns)) {
    if (!existing[name]) await queryInterface.addColumn(table, name, spec as never);
  }
}

/**
 * Controls required by counsel's implementation review (24 Nov 2026):
 * - privacy_choice_events: append-only ledger of optional choices (analytics, marketing) incl. withdrawals.
 * - terms_acceptances: Terms acceptance kept separate from privacy consent.
 * - marketing_suppressions: durable do-not-contact list checked before any promotional send.
 * - legal_holds: pause retention deletion for a subject with a recorded reason.
 * - consent_records: notice key + staff verification of a parent/guardian's identity.
 * - privacy_requests: assignment, scope, exemptions, how identity was verified.
 * - google_oauth_transactions: pending profile so new Google users are not created before age/terms.
 * - devices: remove raw hardware/installation identifiers from metadata (keep hashes only).
 */
const migration: Migration = {
  id: "202611250002_privacy_controls",
  async up({ queryInterface }) {
    if (!(await tableExists(queryInterface, "privacy_choice_events"))) {
      await queryInterface.createTable("privacy_choice_events", {
        id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
        // USER | ANON | EMAIL
        subjectType: { type: DataTypes.STRING(16), allowNull: false },
        subjectId: { type: DataTypes.STRING, allowNull: false },
        // analytics | marketing_email
        purpose: { type: DataTypes.STRING(40), allowNull: false },
        // GRANT | DECLINE | WITHDRAW
        action: { type: DataTypes.STRING(16), allowNull: false },
        noticeKey: { type: DataTypes.STRING(40), allowNull: false },
        noticeVersion: { type: DataTypes.STRING(40), allowNull: false },
        source: { type: DataTypes.STRING(60), allowNull: false },
        idempotencyKey: { type: DataTypes.STRING(100), allowNull: true, unique: true },
        ipHash: { type: DataTypes.STRING, allowNull: true },
        userAgent: { type: DataTypes.STRING(512), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("privacy_choice_events", ["subjectType", "subjectId", "purpose", "createdAt"]);
    }

    if (!(await tableExists(queryInterface, "terms_acceptances"))) {
      await queryInterface.createTable("terms_acceptances", {
        id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
        subjectType: { type: DataTypes.STRING(32), allowNull: false },
        subjectId: { type: DataTypes.STRING, allowNull: false },
        documentKey: { type: DataTypes.STRING(40), allowNull: false },
        version: { type: DataTypes.STRING(40), allowNull: false },
        // SELF | GUARDIAN
        acceptedBy: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "SELF" },
        ipHash: { type: DataTypes.STRING, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("terms_acceptances", ["subjectType", "subjectId"]);
    }

    if (!(await tableExists(queryInterface, "marketing_suppressions"))) {
      await queryInterface.createTable("marketing_suppressions", {
        id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
        normalizedEmail: { type: DataTypes.STRING, allowNull: false },
        // email | whatsapp | all
        channel: { type: DataTypes.STRING(16), allowNull: false },
        // UNSUBSCRIBE_LINK | ONE_CLICK | PREFERENCES | PRIVACY_REQUEST | ADMIN | COMPLAINT
        reason: { type: DataTypes.STRING(32), allowNull: false },
        source: { type: DataTypes.STRING(60), allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("marketing_suppressions", ["normalizedEmail", "channel"], { unique: true });
    }

    if (!(await tableExists(queryInterface, "legal_holds"))) {
      await queryInterface.createTable("legal_holds", {
        id: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
        // USER | REGISTRATION | CONTACT_LEAD | EMAIL
        subjectType: { type: DataTypes.STRING(32), allowNull: false },
        subjectId: { type: DataTypes.STRING, allowNull: true },
        email: { type: DataTypes.STRING, allowNull: true },
        reason: { type: DataTypes.TEXT, allowNull: false },
        createdByAdminId: { type: DataTypes.STRING, allowNull: true },
        releasedAt: { type: DataTypes.DATE, allowNull: true },
        releasedByAdminId: { type: DataTypes.STRING, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface.addIndex("legal_holds", ["releasedAt"]);
    }

    await addColumns(queryInterface, "consent_records", {
      noticeKey: { type: DataTypes.STRING(40), allowNull: true },
      guardianVerifiedAt: { type: DataTypes.DATE, allowNull: true },
      guardianVerificationMethod: { type: DataTypes.STRING(40), allowNull: true },
      guardianVerificationNote: { type: DataTypes.TEXT, allowNull: true },
      guardianVerifiedByAdminId: { type: DataTypes.STRING, allowNull: true },
    });
    // "AWAITING_VERIFICATION" does not fit the original STRING(16).
    await queryInterface.changeColumn("consent_records", "guardianStatus", {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "NOT_REQUIRED",
    });
    await addColumns(queryInterface, "privacy_requests", {
      assignedToAdminId: { type: DataTypes.STRING, allowNull: true },
      scope: { type: DataTypes.TEXT, allowNull: true },
      exemptionNote: { type: DataTypes.TEXT, allowNull: true },
      verifiedVia: { type: DataTypes.STRING(24), allowNull: true },
    });
    await addColumns(queryInterface, "google_oauth_transactions", {
      pendingProfileJson: { type: DataTypes.TEXT, allowNull: true },
    });

    // Data minimisation: raw hardware/installation identifiers were kept in devices.metadataJson.
    // Move them into the existing peppered-hash columns and drop the raw values.
    const [rows] = (await queryInterface.sequelize.query(
      `SELECT id, "metadataJson", "installationIdHash", "deviceFingerprintHash" FROM devices WHERE "metadataJson" LIKE '%hardwareId%' OR "metadataJson" LIKE '%installationId%'`,
    )) as [Array<{ id: string; metadataJson: string; installationIdHash: string | null; deviceFingerprintHash: string | null }>, unknown];
    for (const row of rows) {
      let meta: Record<string, unknown>;
      try {
        meta = JSON.parse(row.metadataJson) as Record<string, unknown>;
      } catch {
        continue;
      }
      const installationIdHash =
        row.installationIdHash ?? (typeof meta.installationId === "string" ? hashInstallationId(meta.installationId) : null);
      const deviceFingerprintHash =
        row.deviceFingerprintHash ?? (typeof meta.hardwareId === "string" ? hashDeviceFingerprint(meta.hardwareId) : null);
      delete meta.installationId;
      delete meta.hardwareId;
      await queryInterface.sequelize.query(
        `UPDATE devices SET "metadataJson" = :meta, "installationIdHash" = :ih, "deviceFingerprintHash" = :fh WHERE id = :id`,
        { replacements: { meta: JSON.stringify(meta), ih: installationIdHash, fh: deviceFingerprintHash, id: row.id } },
      );
    }
  },
  async down({ queryInterface }) {
    for (const t of ["privacy_choice_events", "terms_acceptances", "marketing_suppressions", "legal_holds"]) {
      if (await tableExists(queryInterface, t)) await queryInterface.dropTable(t);
    }
  },
};

export default migration;
