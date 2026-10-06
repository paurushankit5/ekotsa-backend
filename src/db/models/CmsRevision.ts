import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class CmsRevision extends Model<
  InferAttributes<CmsRevision>,
  InferCreationAttributes<CmsRevision>
> {
  declare id: CreationOptional<string>;
  declare entityType: string;
  declare entityId: string;
  declare version: number;
  declare snapshotJson: string;
  declare note: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

export function initCmsRevisionModel(sequelize: Sequelize): typeof CmsRevision {
  CmsRevision.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      entityType: { type: DataTypes.STRING, allowNull: false },
      entityId: { type: DataTypes.STRING, allowNull: false },
      version: { type: DataTypes.INTEGER, allowNull: false },
      snapshotJson: { type: DataTypes.TEXT, allowNull: false },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdByUserId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsRevision",
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ["entityType", "entityId"] },
        { fields: ["createdAt"] },
        { unique: true, fields: ["entityType", "entityId", "version"] },
      ],
    },
  );
  return CmsRevision;
}
