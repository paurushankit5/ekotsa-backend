import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class ActivationCode extends Model<
  InferAttributes<ActivationCode>,
  InferCreationAttributes<ActivationCode>
> {
  declare id: CreationOptional<string>;
  declare codeHash: string;
  declare plan: string;
  declare expiresAt: Date;
  declare redeemedByUserId: CreationOptional<string | null>;
  declare redeemedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initActivationCodeModel(sequelize: Sequelize): typeof ActivationCode {
  ActivationCode.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      codeHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      plan: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      redeemedByUserId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      redeemedAt: {
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
      tableName: "activation_codes",
      timestamps: true,
      indexes: [
        { fields: ["codeHash"], unique: true },
        { fields: ["redeemedAt"] },
        { fields: ["expiresAt"] },
      ],
    },
  );

  return ActivationCode;
}
