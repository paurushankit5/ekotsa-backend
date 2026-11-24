import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type PrivacyRequestType =
  | "ACCESS"
  | "CORRECTION"
  | "ERASURE"
  | "WITHDRAW_CONSENT"
  | "NOMINATION"
  | "GRIEVANCE"
  | "OTHER";
export type PrivacyRequestStatus = "PENDING_VERIFICATION" | "RECEIVED" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

/** Data Principal rights requests and grievances handled by the Grievance Officer. */
export class PrivacyRequest extends Model<
  InferAttributes<PrivacyRequest>,
  InferCreationAttributes<PrivacyRequest>
> {
  declare id: CreationOptional<string>;
  declare reference: string;
  declare type: PrivacyRequestType;
  declare requesterRole: CreationOptional<string>;
  declare name: string;
  declare email: string;
  declare phone: CreationOptional<string | null>;
  declare details: string;
  declare status: CreationOptional<PrivacyRequestStatus>;
  declare verifyTokenHash: CreationOptional<string | null>;
  declare verifiedAt: CreationOptional<Date | null>;
  declare acknowledgedAt: CreationOptional<Date | null>;
  declare dueAt: CreationOptional<Date | null>;
  declare resolvedAt: CreationOptional<Date | null>;
  declare resolutionNote: CreationOptional<string | null>;
  declare handledByAdminId: CreationOptional<string | null>;
  declare assignedToAdminId: CreationOptional<string | null>;
  declare scope: CreationOptional<string | null>;
  declare exemptionNote: CreationOptional<string | null>;
  declare verifiedVia: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initPrivacyRequestModel(sequelize: Sequelize): typeof PrivacyRequest {
  PrivacyRequest.init(
    {
      id: { type: DataTypes.STRING, primaryKey: true, defaultValue: () => createId() },
      reference: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      type: { type: DataTypes.STRING(32), allowNull: false },
      requesterRole: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "SELF" },
      name: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING(40), allowNull: true },
      details: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "PENDING_VERIFICATION" },
      verifyTokenHash: { type: DataTypes.STRING, allowNull: true, unique: true },
      verifiedAt: { type: DataTypes.DATE, allowNull: true },
      acknowledgedAt: { type: DataTypes.DATE, allowNull: true },
      dueAt: { type: DataTypes.DATE, allowNull: true },
      resolvedAt: { type: DataTypes.DATE, allowNull: true },
      resolutionNote: { type: DataTypes.TEXT, allowNull: true },
      handledByAdminId: { type: DataTypes.STRING, allowNull: true },
      assignedToAdminId: { type: DataTypes.STRING, allowNull: true },
      scope: { type: DataTypes.TEXT, allowNull: true },
      exemptionNote: { type: DataTypes.TEXT, allowNull: true },
      verifiedVia: { type: DataTypes.STRING(24), allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "privacy_requests",
      timestamps: true,
      indexes: [{ fields: ["status", "dueAt"] }, { fields: ["email"] }],
    },
  );
  return PrivacyRequest;
}
