import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class ActivationSession extends Model<
  InferAttributes<ActivationSession>,
  InferCreationAttributes<ActivationSession>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare sessionTokenHash: string;
  declare expiresAt: Date;
  declare consumedAt: CreationOptional<Date | null>;
  declare ipAddress: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initActivationSessionModel(sequelize: Sequelize): typeof ActivationSession {
  ActivationSession.init(
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
      sessionTokenHash: {
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
      ipAddress: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      userAgent: {
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
      tableName: "activation_sessions",
      timestamps: true,
    },
  );

  return ActivationSession;
}
