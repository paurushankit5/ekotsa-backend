import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type AppReleaseStatus =
  | "UPLOADING"
  | "STABLE"
  | "BETA"
  | "ARCHIVED"
  | "DELETED";

export type AppReleasePlatform = "windows" | "macos" | "linux";

export class AppRelease extends Model<
  InferAttributes<AppRelease>,
  InferCreationAttributes<AppRelease>
> {
  declare id: CreationOptional<string>;
  declare product: CreationOptional<string>;
  declare version: string;
  declare platform: AppReleasePlatform;
  declare architecture: string;
  declare status: CreationOptional<AppReleaseStatus>;
  declare fileName: string;
  declare contentType: CreationOptional<string>;
  declare storageBucket: string;
  declare storagePath: string;
  declare installerSize: CreationOptional<number>;
  declare expectedSize: CreationOptional<number | null>;
  declare sha256: CreationOptional<string | null>;
  declare releaseNotesUrl: CreationOptional<string | null>;
  declare signingStatus: CreationOptional<"SIGNED" | "UNSIGNED" | "UNKNOWN">;
  declare minimumSupportedVersion: CreationOptional<string | null>;
  declare uploadTokenHash: CreationOptional<string | null>;
  declare uploadExpiresAt: CreationOptional<Date | null>;
  declare publishedAt: CreationOptional<Date | null>;
  declare createdByAdminId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initAppReleaseModel(sequelize: Sequelize): typeof AppRelease {
  AppRelease.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      product: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "Ekotsa Atithi",
      },
      version: { type: DataTypes.STRING, allowNull: false },
      platform: {
        type: DataTypes.ENUM("windows", "macos", "linux"),
        allowNull: false,
      },
      architecture: { type: DataTypes.STRING, allowNull: false, defaultValue: "x64" },
      status: {
        type: DataTypes.ENUM("UPLOADING", "STABLE", "BETA", "ARCHIVED", "DELETED"),
        allowNull: false,
        defaultValue: "UPLOADING",
      },
      fileName: { type: DataTypes.STRING, allowNull: false },
      contentType: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "application/octet-stream",
      },
      storageBucket: { type: DataTypes.STRING, allowNull: false },
      storagePath: { type: DataTypes.STRING, allowNull: false },
      installerSize: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      expectedSize: { type: DataTypes.INTEGER, allowNull: true },
      sha256: { type: DataTypes.STRING, allowNull: true },
      releaseNotesUrl: { type: DataTypes.STRING, allowNull: true },
      signingStatus: {
        type: DataTypes.ENUM("SIGNED", "UNSIGNED", "UNKNOWN"),
        allowNull: false,
        defaultValue: "UNSIGNED",
      },
      minimumSupportedVersion: { type: DataTypes.STRING, allowNull: true },
      uploadTokenHash: { type: DataTypes.STRING, allowNull: true },
      uploadExpiresAt: { type: DataTypes.DATE, allowNull: true },
      publishedAt: { type: DataTypes.DATE, allowNull: true },
      createdByAdminId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "app_releases",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["product", "version", "platform", "architecture"],
          name: "app_releases_product_version_platform_arch_unique",
        },
      ],
    },
  );
  return AppRelease;
}
