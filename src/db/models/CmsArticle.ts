import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type CmsArticleKind = "BLOG" | "GUIDE";

export type CmsContentStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED";

export const CMS_CONTENT_STATUSES: CmsContentStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED",
];

export class CmsArticle extends Model<
  InferAttributes<CmsArticle>,
  InferCreationAttributes<CmsArticle>
> {
  declare id: CreationOptional<string>;
  declare kind: CmsArticleKind;
  declare slug: string;
  declare title: string;
  declare excerpt: string;
  declare description: string;
  declare category: string;
  declare publishedLabel: CreationOptional<string | null>;
  declare readingTime: CreationOptional<string | null>;
  declare coverLabel: CreationOptional<string | null>;
  declare keywordsJson: CreationOptional<string | null>;
  declare contentJson: CreationOptional<string | null>;
  declare relatedLinksJson: CreationOptional<string | null>;
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

export function initCmsArticleModel(sequelize: Sequelize): typeof CmsArticle {
  CmsArticle.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      kind: {
        type: DataTypes.ENUM("BLOG", "GUIDE"),
        allowNull: false,
      },
      slug: { type: DataTypes.STRING, allowNull: false },
      title: { type: DataTypes.STRING, allowNull: false },
      excerpt: { type: DataTypes.TEXT, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      category: { type: DataTypes.STRING, allowNull: false },
      publishedLabel: { type: DataTypes.STRING, allowNull: true },
      readingTime: { type: DataTypes.STRING, allowNull: true },
      coverLabel: { type: DataTypes.STRING, allowNull: true },
      keywordsJson: { type: DataTypes.TEXT, allowNull: true },
      contentJson: { type: DataTypes.TEXT, allowNull: true },
      relatedLinksJson: { type: DataTypes.TEXT, allowNull: true },
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
      tableName: "CmsArticle",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["kind", "slug"] },
        { fields: ["kind", "status"] },
        { fields: ["kind", "publishedAt"] },
        { fields: ["sortOrder"] },
        { fields: ["version"] },
      ],
    },
  );
  return CmsArticle;
}
