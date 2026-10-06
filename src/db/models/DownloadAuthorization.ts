import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class DownloadAuthorization extends Model<
  InferAttributes<DownloadAuthorization>,
  InferCreationAttributes<DownloadAuthorization>
> {
  declare id: CreationOptional<string>;
  declare userId: CreationOptional<string | null>;
  declare registrationId: CreationOptional<string | null>;
  declare organizationId: CreationOptional<string | null>;
  declare productCode: CreationOptional<string>;
  declare platform: CreationOptional<string>;
  declare installerVersion: CreationOptional<string>;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare remainingUses: CreationOptional<number>;
  declare lastUsedAt: CreationOptional<Date | null>;
  declare revokedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initDownloadAuthorizationModel(
  sequelize: Sequelize,
): typeof DownloadAuthorization {
  DownloadAuthorization.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      userId: { type: DataTypes.STRING, allowNull: true },
      registrationId: { type: DataTypes.STRING, allowNull: true },
      organizationId: { type: DataTypes.STRING, allowNull: true },
      productCode: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "ekotsa-os",
      },
      platform: { type: DataTypes.STRING, allowNull: false, defaultValue: "*" },
      installerVersion: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "stable",
      },
      tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      remainingUses: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { sequelize, tableName: "download_authorizations", timestamps: true },
  );
  return DownloadAuthorization;
}
