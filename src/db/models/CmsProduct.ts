import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type CmsProductDbStatus =
  | "AVAILABLE"
  | "BETA"
  | "EARLY_ACCESS"
  | "IN_DEVELOPMENT"
  | "COMING_SOON"
  | "PAUSED"
  | "ARCHIVED"
  | "DISCONTINUED";

export const CMS_PRODUCT_STATUSES: CmsProductDbStatus[] = [
  "AVAILABLE",
  "BETA",
  "EARLY_ACCESS",
  "IN_DEVELOPMENT",
  "COMING_SOON",
  "PAUSED",
  "ARCHIVED",
  "DISCONTINUED",
];

export class CmsProduct extends Model<
  InferAttributes<CmsProduct>,
  InferCreationAttributes<CmsProduct>
> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare path: string;
  declare title: string;
  declare description: string;
  declare category: CreationOptional<string | null>;
  declare status: CreationOptional<CmsProductDbStatus>;
  declare heroLabel: CreationOptional<string | null>;
  declare summary: CreationOptional<string | null>;
  declare featuresJson: CreationOptional<string | null>;
  declare benefitsJson: CreationOptional<string | null>;
  declare modulesJson: CreationOptional<string | null>;
  declare seoTitle: CreationOptional<string | null>;
  declare seoDescription: CreationOptional<string | null>;
  declare structuredDataJson: CreationOptional<string | null>;
  declare ctaPrimaryLabel: CreationOptional<string | null>;
  declare ctaPrimaryHref: CreationOptional<string | null>;
  declare ctaSecondaryLabel: CreationOptional<string | null>;
  declare ctaSecondaryHref: CreationOptional<string | null>;
  declare sortOrder: CreationOptional<number>;
  declare publishedAt: CreationOptional<Date | null>;
  declare scheduledAt: CreationOptional<Date | null>;
  declare archivedAt: CreationOptional<Date | null>;
  declare featuredAssetId: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<string | null>;
  declare updatedByUserId: CreationOptional<string | null>;
  declare publishedByUserId: CreationOptional<string | null>;
  declare archivedByUserId: CreationOptional<string | null>;
  declare version: CreationOptional<number>;
  declare publishedVersion: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCmsProductModel(sequelize: Sequelize): typeof CmsProduct {
  CmsProduct.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      slug: { type: DataTypes.STRING, allowNull: false, unique: true },
      path: { type: DataTypes.STRING, allowNull: false, unique: true },
      title: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      category: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM(...CMS_PRODUCT_STATUSES),
        allowNull: false,
        defaultValue: "AVAILABLE",
      },
      heroLabel: { type: DataTypes.STRING, allowNull: true },
      summary: { type: DataTypes.TEXT, allowNull: true },
      featuresJson: { type: DataTypes.TEXT, allowNull: true },
      benefitsJson: { type: DataTypes.TEXT, allowNull: true },
      modulesJson: { type: DataTypes.TEXT, allowNull: true },
      seoTitle: { type: DataTypes.STRING, allowNull: true },
      seoDescription: { type: DataTypes.TEXT, allowNull: true },
      structuredDataJson: { type: DataTypes.TEXT, allowNull: true },
      ctaPrimaryLabel: { type: DataTypes.STRING, allowNull: true },
      ctaPrimaryHref: { type: DataTypes.STRING, allowNull: true },
      ctaSecondaryLabel: { type: DataTypes.STRING, allowNull: true },
      ctaSecondaryHref: { type: DataTypes.STRING, allowNull: true },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      publishedAt: { type: DataTypes.DATE, allowNull: true },
      scheduledAt: { type: DataTypes.DATE, allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true },
      featuredAssetId: { type: DataTypes.STRING, allowNull: true },
      createdByUserId: { type: DataTypes.STRING, allowNull: true },
      updatedByUserId: { type: DataTypes.STRING, allowNull: true },
      publishedByUserId: { type: DataTypes.STRING, allowNull: true },
      archivedByUserId: { type: DataTypes.STRING, allowNull: true },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      publishedVersion: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsProduct",
      timestamps: true,
      indexes: [
        { fields: ["status"] },
        { fields: ["sortOrder"] },
        { fields: ["publishedAt"] },
        { fields: ["version"] },
      ],
    },
  );
  return CmsProduct;
}
