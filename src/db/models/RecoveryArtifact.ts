import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class RecoveryArtifact extends Model<
  InferAttributes<RecoveryArtifact>,
  InferCreationAttributes<RecoveryArtifact>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare deviceId: string;
  declare grantId: CreationOptional<string | null>;
  declare artifactJson: string;
  declare issuedAt: CreationOptional<Date>;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare issuedByAdminId: CreationOptional<string | null>;
  declare reason: CreationOptional<string | null>;
  declare metaJson: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initRecoveryArtifactModel(sequelize: Sequelize): typeof RecoveryArtifact {
  RecoveryArtifact.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      userId: { type: DataTypes.STRING, allowNull: false },
      deviceId: { type: DataTypes.STRING, allowNull: false },
      grantId: { type: DataTypes.STRING, allowNull: true },
      artifactJson: { type: DataTypes.TEXT, allowNull: false },
      issuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      issuedByAdminId: { type: DataTypes.STRING, allowNull: true },
      reason: { type: DataTypes.STRING, allowNull: true },
      metaJson: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "recovery_artifacts",
      timestamps: true,
      indexes: [{ fields: ["userId"] }, { fields: ["deviceId"] }, { fields: ["grantId"] }],
    },
  );
  return RecoveryArtifact;
}
