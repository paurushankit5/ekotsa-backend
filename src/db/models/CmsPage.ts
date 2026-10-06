import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";
import { CMS_CONTENT_STATUSES, type CmsContentStatus } from "./CmsArticle.js";

export class CmsPage extends Model<
  InferAttributes<CmsPage>,
  InferCreationAttributes<CmsPage>
> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare path: string;
  declare title: string;
  declare summary: CreationOptional<string | null>;
  declare template: CreationOptional<string | null>;
  declare bodyJson: CreationOptional<string | null>;
  declare sectionsJson: CreationOptional<string | null>;
  declare seoTitle: CreationOptional<string | null>;
  declare seoDescription: CreationOptional<string | null>;
  declare status: CreationOptional<CmsContentStatus>;
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

export function initCmsPageModel(sequelize: Sequelize): typeof CmsPage {
  CmsPage.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      slug: { type: DataTypes.STRING, allowNull: false, unique: true },
      path: { type: DataTypes.STRING, allowNull: false, unique: true },
      title: { type: DataTypes.STRING, allowNull: false },
      summary: { type: DataTypes.TEXT, allowNull: true },
      template: { type: DataTypes.STRING, allowNull: true },
      bodyJson: { type: DataTypes.TEXT, allowNull: true },
      sectionsJson: { type: DataTypes.TEXT, allowNull: true },
      seoTitle: { type: DataTypes.STRING, allowNull: true },
      seoDescription: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM(...CMS_CONTENT_STATUSES),
        allowNull: false,
        defaultValue: "DRAFT",
      },
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
      tableName: "CmsPage",
      timestamps: true,
      indexes: [
        { fields: ["status"] },
        { fields: ["sortOrder"] },
        { fields: ["publishedAt"] },
        { fields: ["version"] },
      ],
    },
  );
  return CmsPage;
}
