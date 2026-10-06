import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type CmsRoleName =
  | "AUTHOR"
  | "EDITOR"
  | "REVIEWER"
  | "PUBLISHER"
  | "SEO_MANAGER"
  | "MEDIA_MANAGER"
  | "LEGAL_REVIEWER"
  | "AUDITOR"
  | "ADMIN"
  | "SUPER_ADMIN";

export const CMS_ROLES: CmsRoleName[] = [
  "AUTHOR",
  "EDITOR",
  "REVIEWER",
  "PUBLISHER",
  "SEO_MANAGER",
  "MEDIA_MANAGER",
  "LEGAL_REVIEWER",
  "AUDITOR",
  "ADMIN",
  "SUPER_ADMIN",
];

export class CmsRoleAssignment extends Model<
  InferAttributes<CmsRoleAssignment>,
  InferCreationAttributes<CmsRoleAssignment>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare role: CmsRoleName;
  declare note: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCmsRoleAssignmentModel(
  sequelize: Sequelize,
): typeof CmsRoleAssignment {
  CmsRoleAssignment.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      userId: { type: DataTypes.STRING, allowNull: false, unique: true },
      role: {
        type: DataTypes.ENUM(...CMS_ROLES),
        allowNull: false,
      },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdByUserId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsRoleAssignment",
      timestamps: true,
      indexes: [{ fields: ["role"] }],
    },
  );
  return CmsRoleAssignment;
}
