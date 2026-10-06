import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type DeviceStatus = "ACTIVE" | "REVOKED";

export class Device extends Model<
  InferAttributes<Device>,
  InferCreationAttributes<Device>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare deviceIdHash: string;
  declare installationIdHash: CreationOptional<string | null>;
  declare deviceFingerprintHash: CreationOptional<string | null>;
  declare deviceName: string;
  declare platform: string;
  declare osName: CreationOptional<string | null>;
  declare osVersion: CreationOptional<string | null>;
  declare architecture: CreationOptional<string | null>;
  declare appVersion: CreationOptional<string | null>;
  declare publicKey: CreationOptional<string | null>;
  declare status: CreationOptional<DeviceStatus>;
  declare lastSeenAt: CreationOptional<Date | null>;
  declare serverFirstSeenAt: CreationOptional<Date | null>;
  declare serverLastSeenAt: CreationOptional<Date | null>;
  declare metadataJson: CreationOptional<string | null>;
  declare revokedAt: CreationOptional<Date | null>;
  declare revocationReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initDeviceModel(sequelize: Sequelize): typeof Device {
  Device.init(
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
      deviceIdHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      installationIdHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      deviceFingerprintHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      deviceName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      platform: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      osName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      osVersion: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      architecture: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      appVersion: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      publicKey: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("ACTIVE", "REVOKED"),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      serverFirstSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      serverLastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      metadataJson: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      revocationReason: {
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
      tableName: "devices",
      timestamps: true,
    },
  );

  return Device;
}
