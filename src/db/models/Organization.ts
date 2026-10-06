import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type OrganizationStatus = "ACTIVE" | "SUSPENDED";

export class Organization extends Model<
  InferAttributes<Organization>,
  InferCreationAttributes<Organization>
> {
  declare id: CreationOptional<string>;
  declare displayName: string;
  declare normalizedName: string;
  declare status: CreationOptional<OrganizationStatus>;
  declare createdByUserId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initOrganizationModel(sequelize: Sequelize): typeof Organization {
  Organization.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      displayName: { type: DataTypes.STRING, allowNull: false },
      normalizedName: { type: DataTypes.STRING, allowNull: false },
      status: {
        type: DataTypes.ENUM("ACTIVE", "SUSPENDED"),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      createdByUserId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { sequelize, tableName: "organizations", timestamps: true },
  );
  return Organization;
}
