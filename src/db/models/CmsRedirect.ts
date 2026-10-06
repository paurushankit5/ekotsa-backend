import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class CmsRedirect extends Model<
  InferAttributes<CmsRedirect>,
  InferCreationAttributes<CmsRedirect>
> {
  declare id: CreationOptional<string>;
  declare sourcePath: string;
  declare destinationPath: string;
  declare statusCode: CreationOptional<number>;
  declare isActive: CreationOptional<boolean>;
  declare note: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCmsRedirectModel(sequelize: Sequelize): typeof CmsRedirect {
  CmsRedirect.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      sourcePath: { type: DataTypes.STRING, allowNull: false, unique: true },
      destinationPath: { type: DataTypes.STRING, allowNull: false },
      statusCode: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 301 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdByUserId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsRedirect",
      timestamps: true,
      indexes: [{ fields: ["isActive"] }],
    },
  );
  return CmsRedirect;
}
