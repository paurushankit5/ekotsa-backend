import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

/** Append-only record of optional choices (analytics, marketing) and their withdrawal. */
export class PrivacyChoiceEvent extends Model<InferAttributes<PrivacyChoiceEvent>, InferCreationAttributes<PrivacyChoiceEvent>> {
  declare id: CreationOptional<string>;
  declare subjectType: "USER" | "ANON" | "EMAIL";
  declare subjectId: string;
  declare purpose: string;
  declare action: "GRANT" | "DECLINE" | "WITHDRAW";
  declare noticeKey: string;
  declare noticeVersion: string;
  declare source: string;
  declare idempotencyKey: CreationOptional<string | null>;
  declare ipHash: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

/** Acceptance of a Terms version — kept separate from privacy consent. */
export class TermsAcceptance extends Model<InferAttributes<TermsAcceptance>, InferCreationAttributes<TermsAcceptance>> {
  declare id: CreationOptional<string>;
  declare subjectType: string;
  declare subjectId: string;
  declare documentKey: string;
  declare version: string;
  declare acceptedBy: CreationOptional<"SELF" | "GUARDIAN">;
  declare ipHash: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

/** Durable do-not-contact list; checked before every promotional send. */
export class MarketingSuppression extends Model<InferAttributes<MarketingSuppression>, InferCreationAttributes<MarketingSuppression>> {
  declare id: CreationOptional<string>;
  declare normalizedEmail: string;
  declare channel: string;
  declare reason: string;
  declare source: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

/** Pauses retention deletion for a subject (litigation, investigation, statutory request). */
export class LegalHold extends Model<InferAttributes<LegalHold>, InferCreationAttributes<LegalHold>> {
  declare id: CreationOptional<string>;
  declare subjectType: "USER" | "REGISTRATION" | "CONTACT_LEAD" | "EMAIL";
  declare subjectId: CreationOptional<string | null>;
  declare email: CreationOptional<string | null>;
  declare reason: string;
  declare createdByAdminId: CreationOptional<string | null>;
  declare releasedAt: CreationOptional<Date | null>;
  declare releasedByAdminId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

const id = { type: DataTypes.STRING, primaryKey: true, defaultValue: () => createId() };
const date = (allowNull: boolean) => ({ type: DataTypes.DATE, allowNull });

export function initPrivacyControlModels(sequelize: Sequelize) {
  PrivacyChoiceEvent.init(
    {
      id,
      subjectType: { type: DataTypes.STRING(16), allowNull: false },
      subjectId: { type: DataTypes.STRING, allowNull: false },
      purpose: { type: DataTypes.STRING(40), allowNull: false },
      action: { type: DataTypes.STRING(16), allowNull: false },
      noticeKey: { type: DataTypes.STRING(40), allowNull: false },
      noticeVersion: { type: DataTypes.STRING(40), allowNull: false },
      source: { type: DataTypes.STRING(60), allowNull: false },
      idempotencyKey: { type: DataTypes.STRING(100), allowNull: true, unique: true },
      ipHash: { type: DataTypes.STRING, allowNull: true },
      userAgent: { type: DataTypes.STRING(512), allowNull: true },
      createdAt: date(false),
    },
    { sequelize, tableName: "privacy_choice_events", timestamps: true, updatedAt: false },
  );
  TermsAcceptance.init(
    {
      id,
      subjectType: { type: DataTypes.STRING(32), allowNull: false },
      subjectId: { type: DataTypes.STRING, allowNull: false },
      documentKey: { type: DataTypes.STRING(40), allowNull: false },
      version: { type: DataTypes.STRING(40), allowNull: false },
      acceptedBy: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "SELF" },
      ipHash: { type: DataTypes.STRING, allowNull: true },
      createdAt: date(false),
    },
    { sequelize, tableName: "terms_acceptances", timestamps: true, updatedAt: false },
  );
  MarketingSuppression.init(
    {
      id,
      normalizedEmail: { type: DataTypes.STRING, allowNull: false },
      channel: { type: DataTypes.STRING(16), allowNull: false },
      reason: { type: DataTypes.STRING(32), allowNull: false },
      source: { type: DataTypes.STRING(60), allowNull: true },
      createdAt: date(false),
    },
    { sequelize, tableName: "marketing_suppressions", timestamps: true, updatedAt: false },
  );
  LegalHold.init(
    {
      id,
      subjectType: { type: DataTypes.STRING(32), allowNull: false },
      subjectId: { type: DataTypes.STRING, allowNull: true },
      email: { type: DataTypes.STRING, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: false },
      createdByAdminId: { type: DataTypes.STRING, allowNull: true },
      releasedAt: date(true),
      releasedByAdminId: { type: DataTypes.STRING, allowNull: true },
      createdAt: date(false),
      updatedAt: date(false),
    },
    { sequelize, tableName: "legal_holds", timestamps: true },
  );
}
