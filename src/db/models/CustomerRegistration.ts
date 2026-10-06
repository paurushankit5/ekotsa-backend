import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type RegistrationStatus =
  | "PENDING_AUTH"
  | "AUTHENTICATED"
  | "DEVICE_ACTIVATED"
  | "SUSPENDED";

export class CustomerRegistration extends Model<
  InferAttributes<CustomerRegistration>,
  InferCreationAttributes<CustomerRegistration>
> {
  declare id: CreationOptional<string>;
  declare fullName: string;
  declare organizationName: string;
  declare organizationId: CreationOptional<string | null>;
  declare normalizedEmail: string;
  declare contactCountryCode: CreationOptional<string | null>;
  declare contactNumber: CreationOptional<string | null>;
  declare whatsappNumber: CreationOptional<string | null>;
  declare industry: CreationOptional<string | null>;
  declare businessAddress: CreationOptional<string | null>;
  declare status: CreationOptional<RegistrationStatus>;
  declare source: CreationOptional<string>;
  declare linkedUserId: CreationOptional<string | null>;
  declare firstDownloadAt: CreationOptional<Date | null>;
  declare lastDownloadAt: CreationOptional<Date | null>;
  declare firstDeviceActivatedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCustomerRegistrationModel(
  sequelize: Sequelize,
): typeof CustomerRegistration {
  CustomerRegistration.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      fullName: { type: DataTypes.STRING, allowNull: false },
      organizationName: { type: DataTypes.STRING, allowNull: false },
      organizationId: { type: DataTypes.STRING, allowNull: true },
      normalizedEmail: { type: DataTypes.STRING, allowNull: false, unique: true },
      contactCountryCode: { type: DataTypes.STRING, allowNull: true },
      contactNumber: { type: DataTypes.STRING, allowNull: true },
      whatsappNumber: { type: DataTypes.STRING, allowNull: true },
      industry: { type: DataTypes.STRING, allowNull: true },
      businessAddress: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM(
          "PENDING_AUTH",
          "AUTHENTICATED",
          "DEVICE_ACTIVATED",
          "SUSPENDED",
        ),
        allowNull: false,
        defaultValue: "PENDING_AUTH",
      },
      source: { type: DataTypes.STRING, allowNull: false, defaultValue: "public_download" },
      linkedUserId: { type: DataTypes.STRING, allowNull: true, unique: true },
      firstDownloadAt: { type: DataTypes.DATE, allowNull: true },
      lastDownloadAt: { type: DataTypes.DATE, allowNull: true },
      firstDeviceActivatedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { sequelize, tableName: "customer_registrations", timestamps: true },
  );
  return CustomerRegistration;
}
