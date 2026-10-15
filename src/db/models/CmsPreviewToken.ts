import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class CmsPreviewToken extends Model<
  InferAttributes<CmsPreviewToken>,
  InferCreationAttributes<CmsPreviewToken>
> {
  declare id: CreationOptional<string>;
  declare tokenHash: string;
  declare entityType: string;
  declare entityId: string;
  declare revisionVersion: number;
  declare targetPath: string;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare lastUsedAt: CreationOptional<Date | null>;
  declare createdByUserId: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCmsPreviewTokenModel(
  sequelize: Sequelize,
): typeof CmsPreviewToken {
  CmsPreviewToken.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      tokenHash: { type: DataTypes.STRING, allowNull: false, unique: true },
      entityType: { type: DataTypes.STRING, allowNull: false },
      entityId: { type: DataTypes.STRING, allowNull: false },
      revisionVersion: { type: DataTypes.INTEGER, allowNull: false },
      targetPath: { type: DataTypes.STRING, allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      revokedAt: { type: DataTypes.DATE, allowNull: true },
      lastUsedAt: { type: DataTypes.DATE, allowNull: true },
      createdByUserId: { type: DataTypes.STRING, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsPreviewToken",
      timestamps: true,
      indexes: [
        { fields: ["entityType", "entityId"] },
        { fields: ["expiresAt"] },
        { fields: ["revokedAt"] },
      ],
    },
  );
  return CmsPreviewToken;
}
