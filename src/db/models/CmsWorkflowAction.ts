import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class CmsWorkflowAction extends Model<
  InferAttributes<CmsWorkflowAction>,
  InferCreationAttributes<CmsWorkflowAction>
> {
  declare id: CreationOptional<string>;
  declare entityType: string;
  declare entityId: string;
  declare action: string;
  declare fromStatus: CreationOptional<string | null>;
  declare toStatus: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare requestId: CreationOptional<string | null>;
  declare actorUserId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

export function initCmsWorkflowActionModel(
  sequelize: Sequelize,
): typeof CmsWorkflowAction {
  CmsWorkflowAction.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      entityType: { type: DataTypes.STRING, allowNull: false },
      entityId: { type: DataTypes.STRING, allowNull: false },
      action: { type: DataTypes.STRING, allowNull: false },
      fromStatus: { type: DataTypes.STRING, allowNull: true },
      toStatus: { type: DataTypes.STRING, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      requestId: { type: DataTypes.STRING, allowNull: true },
      actorUserId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "CmsWorkflowAction",
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ["entityType", "entityId"] },
        { fields: ["action"] },
        { fields: ["createdAt"] },
      ],
    },
  );
  return CmsWorkflowAction;
}
