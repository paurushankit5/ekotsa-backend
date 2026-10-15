import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type DeviceResetRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export class DeviceResetRequest extends Model<
  InferAttributes<DeviceResetRequest>,
  InferCreationAttributes<DeviceResetRequest>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare deviceId: CreationOptional<string | null>;
  declare status: CreationOptional<DeviceResetRequestStatus>;
  declare reason: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare handledAt: CreationOptional<Date | null>;
  declare handledByAdminId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initDeviceResetRequestModel(
  sequelize: Sequelize,
): typeof DeviceResetRequest {
  DeviceResetRequest.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      userId: { type: DataTypes.STRING, allowNull: false },
      deviceId: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED", "EXPIRED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      reason: { type: DataTypes.STRING, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      handledAt: { type: DataTypes.DATE, allowNull: true },
      handledByAdminId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "device_reset_requests",
      timestamps: true,
      indexes: [{ fields: ["userId"] }, { fields: ["status"] }, { fields: ["createdAt"] }],
    },
  );
  return DeviceResetRequest;
}
