import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class DeviceAuthToken extends Model<
  InferAttributes<DeviceAuthToken>,
  InferCreationAttributes<DeviceAuthToken>
> {
  declare id: CreationOptional<string>;
  declare deviceId: string;
  declare tokenHash: string;
  declare issuedAt: CreationOptional<Date>;
  declare expiresAt: Date;
  declare revokedAt: CreationOptional<Date | null>;
  declare lastUsedAt: CreationOptional<Date | null>;
  declare ipAddress: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initDeviceAuthTokenModel(sequelize: Sequelize): typeof DeviceAuthToken {
  DeviceAuthToken.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      deviceId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      tokenHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
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
      lastUsedAt: {
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
      tableName: "device_auth_tokens",
      timestamps: true,
    },
  );

  return DeviceAuthToken;
}
