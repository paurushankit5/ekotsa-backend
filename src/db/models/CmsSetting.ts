import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class CmsSetting extends Model<
  InferAttributes<CmsSetting>,
  InferCreationAttributes<CmsSetting>
> {
  declare id: CreationOptional<string>;
  declare key: string;
  declare valueJson: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare updatedByUserId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCmsSettingModel(sequelize: Sequelize): typeof CmsSetting {
  CmsSetting.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      key: { type: DataTypes.STRING, allowNull: false, unique: true },
      valueJson: { type: DataTypes.TEXT, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      updatedByUserId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsSetting",
      timestamps: true,
    },
  );
  return CmsSetting;
}
