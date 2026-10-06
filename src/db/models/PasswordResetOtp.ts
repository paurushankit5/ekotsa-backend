import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class PasswordResetOtp extends Model<
  InferAttributes<PasswordResetOtp>,
  InferCreationAttributes<PasswordResetOtp>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare otpHash: string;
  declare expiresAt: Date;
  declare consumedAt: CreationOptional<Date | null>;
  declare attemptCount: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initPasswordResetOtpModel(sequelize: Sequelize): typeof PasswordResetOtp {
  PasswordResetOtp.init(
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
      otpHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      consumedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      attemptCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
      tableName: "password_reset_otps",
      timestamps: true,
    },
  );

  return PasswordResetOtp;
}
