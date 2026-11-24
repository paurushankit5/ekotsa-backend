import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

/**
 * One-time code that moves an ADMIN session from the public site (where the user logs in)
 * to the admin host, so no session token ever travels in a URL. Only the SHA-256 hash is stored.
 */
export class AdminHandoffCode extends Model<
  InferAttributes<AdminHandoffCode>,
  InferCreationAttributes<AdminHandoffCode>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare codeHash: string;
  declare expiresAt: Date;
  declare consumedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initAdminHandoffCodeModel(sequelize: Sequelize): typeof AdminHandoffCode {
  AdminHandoffCode.init(
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
      codeHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      consumedAt: {
        type: DataTypes.DATE,
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
      tableName: "admin_handoff_codes",
      timestamps: true,
      indexes: [{ fields: ["userId"] }, { fields: ["expiresAt"] }],
    },
  );

  return AdminHandoffCode;
}
