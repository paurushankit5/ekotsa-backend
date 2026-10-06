import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type LicenseGrantStatus = "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED";

export class LicenseGrant extends Model<
  InferAttributes<LicenseGrant>,
  InferCreationAttributes<LicenseGrant>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare deviceId: string;
  declare plan: string;
  declare status: CreationOptional<LicenseGrantStatus>;
  declare issuedAt: CreationOptional<Date>;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare suspendedAt: CreationOptional<Date | null>;
  declare reason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initLicenseGrantModel(sequelize: Sequelize): typeof LicenseGrant {
  LicenseGrant.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      deviceId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      plan: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("ACTIVE", "SUSPENDED", "REVOKED", "EXPIRED"),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      issuedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      suspendedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      reason: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "license_grants",
      timestamps: true,
      indexes: [
        { fields: ["userId"] },
        { fields: ["deviceId"] },
        { fields: ["status"] },
        { fields: ["expiresAt"] },
      ],
    },
  );

  return LicenseGrant;
}
