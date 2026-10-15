import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";
import type { UserRole } from "./User.js";

export class AuditLog extends Model<
  InferAttributes<AuditLog>,
  InferCreationAttributes<AuditLog>
> {
  declare id: CreationOptional<string>;
  declare actorUserId: CreationOptional<string | null>;
  declare actorEmail: CreationOptional<string | null>;
  declare actorRole: CreationOptional<UserRole | null>;
  declare event: string;
  declare severity: CreationOptional<string>;
  declare ip: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare targetType: CreationOptional<string | null>;
  declare targetId: CreationOptional<string | null>;
  declare metaJson: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

export function initAuditLogModel(sequelize: Sequelize): typeof AuditLog {
  AuditLog.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      actorUserId: { type: DataTypes.STRING, allowNull: true },
      actorEmail: { type: DataTypes.STRING, allowNull: true },
      actorRole: {
        type: DataTypes.ENUM("USER", "ADMIN"),
        allowNull: true,
      },
      event: { type: DataTypes.STRING, allowNull: false },
      severity: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "info",
      },
      ip: { type: DataTypes.STRING, allowNull: true },
      userAgent: { type: DataTypes.STRING, allowNull: true },
      targetType: { type: DataTypes.STRING, allowNull: true },
      targetId: { type: DataTypes.STRING, allowNull: true },
      metaJson: { type: DataTypes.TEXT, allowNull: true },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "audit_logs",
      timestamps: false,
      updatedAt: false,
      indexes: [
        { fields: ["createdAt"] },
        { fields: ["event"] },
        { fields: ["actorUserId"] },
        { fields: ["targetType", "targetId"] },
      ],
    },
  );
  return AuditLog;
}
