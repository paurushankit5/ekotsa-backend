import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from "sequelize";

export type CmsMenuLocation = "HEADER" | "FOOTER";

export class CmsMenu extends Model<
  InferAttributes<CmsMenu>,
  InferCreationAttributes<CmsMenu>
> {
  declare id: CreationOptional<string>;
  declare key: string;
  declare label: string;
  declare location: CmsMenuLocation;
  declare description: CreationOptional<string | null>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare items?: NonAttribute<CmsMenuItem[]>;
}

export class CmsMenuItem extends Model<
  InferAttributes<CmsMenuItem>,
  InferCreationAttributes<CmsMenuItem>
> {
  declare id: CreationOptional<string>;
  declare menuId: string;
  declare label: string;
  declare href: string;
  declare note: CreationOptional<string | null>;
  declare style: CreationOptional<string | null>;
  declare orderIndex: CreationOptional<number>;
  declare isPrimary: CreationOptional<boolean>;
  declare openInNewTab: CreationOptional<boolean>;
  declare isVisible: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCmsMenuModel(sequelize: Sequelize): typeof CmsMenu {
  CmsMenu.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      key: { type: DataTypes.STRING, allowNull: false, unique: true },
      label: { type: DataTypes.STRING, allowNull: false },
      location: {
        type: DataTypes.ENUM("HEADER", "FOOTER"),
        allowNull: false,
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsMenu",
      timestamps: true,
      indexes: [{ fields: ["location"] }],
    },
  );
  return CmsMenu;
}

export function initCmsMenuItemModel(sequelize: Sequelize): typeof CmsMenuItem {
  CmsMenuItem.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      menuId: { type: DataTypes.STRING, allowNull: false },
      label: { type: DataTypes.STRING, allowNull: false },
      href: { type: DataTypes.STRING, allowNull: false },
      note: { type: DataTypes.STRING, allowNull: true },
      style: { type: DataTypes.STRING, allowNull: true },
      orderIndex: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      openInNewTab: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      isVisible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsMenuItem",
      timestamps: true,
      indexes: [{ fields: ["menuId", "orderIndex"] }],
    },
  );
  return CmsMenuItem;
}
