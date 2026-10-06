import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type RecoveryRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export class RecoveryRequest extends Model<
  InferAttributes<RecoveryRequest>,
  InferCreationAttributes<RecoveryRequest>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare deviceId: CreationOptional<string | null>;
  declare grantId: string;
  declare status: CreationOptional<RecoveryRequestStatus>;
  declare reason: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare artifactId: CreationOptional<string | null>;
  declare requestedAt: CreationOptional<Date>;
  declare handledAt: CreationOptional<Date | null>;
  declare handledByAdminId: CreationOptional<string | null>;
  declare expiresAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initRecoveryRequestModel(sequelize: Sequelize): typeof RecoveryRequest {
  RecoveryRequest.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      userId: { type: DataTypes.STRING, allowNull: false },
      deviceId: { type: DataTypes.STRING, allowNull: true },
      grantId: { type: DataTypes.STRING, allowNull: false },
      status: {
        type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED", "EXPIRED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      reason: { type: DataTypes.STRING, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      artifactId: { type: DataTypes.STRING, allowNull: true, unique: true },
      requestedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      handledAt: { type: DataTypes.DATE, allowNull: true },
      handledByAdminId: { type: DataTypes.STRING, allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "recovery_requests",
      timestamps: true,
      indexes: [
        { fields: ["userId"] },
        { fields: ["grantId"] },
        { fields: ["status"] },
      ],
    },
  );
  return RecoveryRequest;
}
