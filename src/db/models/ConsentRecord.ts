import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type ConsentSubjectType = "USER" | "REGISTRATION" | "CONTACT_LEAD";
export type AgeCategory = "ADULT" | "MINOR";
/** PENDING = waiting for the guardian; AWAITING_VERIFICATION = guardian said yes, staff must verify identity. */
export type GuardianStatus = "NOT_REQUIRED" | "PENDING" | "AWAITING_VERIFICATION" | "APPROVED" | "DECLINED" | "EXPIRED";

/** Proof-of-consent ledger. Guardian tokens are stored only as SHA-256 hashes. */
export class ConsentRecord extends Model<
  InferAttributes<ConsentRecord>,
  InferCreationAttributes<ConsentRecord>
> {
  declare id: CreationOptional<string>;
  declare subjectType: ConsentSubjectType;
  declare subjectId: string;
  declare email: CreationOptional<string | null>;
  declare purposes: string[];
  declare noticeVersion: string;
  declare ageCategory: AgeCategory;
  declare marketingConsent: CreationOptional<boolean>;
  declare guardianName: CreationOptional<string | null>;
  declare guardianEmail: CreationOptional<string | null>;
  declare guardianRelationship: CreationOptional<string | null>;
  declare guardianStatus: CreationOptional<GuardianStatus>;
  declare guardianTokenHash: CreationOptional<string | null>;
  declare guardianTokenExpiresAt: CreationOptional<Date | null>;
  declare guardianRespondedAt: CreationOptional<Date | null>;
  declare ipHash: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare withdrawnAt: CreationOptional<Date | null>;
  declare noticeKey: CreationOptional<string | null>;
  declare guardianVerifiedAt: CreationOptional<Date | null>;
  declare guardianVerificationMethod: CreationOptional<string | null>;
  declare guardianVerificationNote: CreationOptional<string | null>;
  declare guardianVerifiedByAdminId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initConsentRecordModel(sequelize: Sequelize): typeof ConsentRecord {
  ConsentRecord.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => createId() },
      subjectType: { type: DataTypes.STRING(32), allowNull: false },
      subjectId: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: true },
      purposes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      noticeVersion: { type: DataTypes.STRING(40), allowNull: false },
      ageCategory: { type: DataTypes.STRING(16), allowNull: false },
      marketingConsent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      guardianName: { type: DataTypes.STRING, allowNull: true },
      guardianEmail: { type: DataTypes.STRING, allowNull: true },
      guardianRelationship: { type: DataTypes.STRING(32), allowNull: true },
      guardianStatus: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "NOT_REQUIRED" },
      guardianTokenHash: { type: DataTypes.STRING, allowNull: true, unique: true },
      guardianTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
      guardianRespondedAt: { type: DataTypes.DATE, allowNull: true },
      ipHash: { type: DataTypes.STRING, allowNull: true },
      userAgent: { type: DataTypes.STRING(512), allowNull: true },
      withdrawnAt: { type: DataTypes.DATE, allowNull: true },
      noticeKey: { type: DataTypes.STRING(40), allowNull: true },
      guardianVerifiedAt: { type: DataTypes.DATE, allowNull: true },
      guardianVerificationMethod: { type: DataTypes.STRING(40), allowNull: true },
      guardianVerificationNote: { type: DataTypes.TEXT, allowNull: true },
      guardianVerifiedByAdminId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "consent_records",
      timestamps: true,
      indexes: [
        { fields: ["subjectType", "subjectId"] },
        { fields: ["guardianStatus", "guardianTokenExpiresAt"] },
      ],
    },
  );
  return ConsentRecord;
}
