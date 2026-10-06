import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type CmsAssetKind = "IMAGE" | "FILE" | "VIDEO";

export class CmsAsset extends Model<
  InferAttributes<CmsAsset>,
  InferCreationAttributes<CmsAsset>
> {
  declare id: CreationOptional<string>;
  declare kind: CreationOptional<CmsAssetKind>;
  declare title: string;
  declare altText: CreationOptional<string | null>;
  declare sourceUrl: string;
  declare storageBucket: CreationOptional<string | null>;
  declare storagePath: CreationOptional<string | null>;
  declare mimeType: CreationOptional<string | null>;
  declare sizeBytes: CreationOptional<number | null>;
  declare width: CreationOptional<number | null>;
  declare height: CreationOptional<number | null>;
  declare checksum: CreationOptional<string | null>;
  declare metadataJson: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCmsAssetModel(sequelize: Sequelize): typeof CmsAsset {
  CmsAsset.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      kind: {
        type: DataTypes.ENUM("IMAGE", "FILE", "VIDEO"),
        allowNull: false,
        defaultValue: "IMAGE",
      },
      title: { type: DataTypes.STRING, allowNull: false },
      altText: { type: DataTypes.STRING, allowNull: true },
      sourceUrl: { type: DataTypes.STRING, allowNull: false },
      storageBucket: { type: DataTypes.STRING, allowNull: true },
      storagePath: { type: DataTypes.STRING, allowNull: true },
      mimeType: { type: DataTypes.STRING, allowNull: true },
      sizeBytes: { type: DataTypes.INTEGER, allowNull: true },
      width: { type: DataTypes.INTEGER, allowNull: true },
      height: { type: DataTypes.INTEGER, allowNull: true },
      checksum: { type: DataTypes.STRING, allowNull: true },
      metadataJson: { type: DataTypes.TEXT, allowNull: true },
      createdByUserId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsAsset",
      timestamps: true,
      indexes: [{ fields: ["kind"] }, { fields: ["createdAt"] }],
    },
  );
  return CmsAsset;
}
