import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class ContactLead extends Model<
  InferAttributes<ContactLead>,
  InferCreationAttributes<ContactLead>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare organization: string;
  declare email: string;
  declare countryCode: string;
  declare phone: string;
  declare whatsapp: string;
  declare requirement: CreationOptional<string | null>;
  declare source: CreationOptional<string>;
  declare status: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initContactLeadModel(sequelize: Sequelize): typeof ContactLead {
  ContactLead.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      name: { type: DataTypes.STRING, allowNull: false },
      organization: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: false },
      countryCode: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: false },
      whatsapp: { type: DataTypes.STRING, allowNull: false },
      requirement: { type: DataTypes.TEXT, allowNull: true },
      source: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "contact_form",
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "NEW",
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "contact_leads",
      timestamps: true,
      indexes: [
        { fields: ["email"] },
        { fields: ["organization"] },
        { fields: ["status"] },
        { fields: ["createdAt"] },
      ],
    },
  );
  return ContactLead;
}
