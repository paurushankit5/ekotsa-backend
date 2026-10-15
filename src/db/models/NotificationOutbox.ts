import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type NotificationOutboxStatus =
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "FAILED"
  | "CANCELED";

export class NotificationOutbox extends Model<
  InferAttributes<NotificationOutbox>,
  InferCreationAttributes<NotificationOutbox>
> {
  declare id: CreationOptional<string>;
  declare status: CreationOptional<NotificationOutboxStatus>;
  declare scheduledAt: CreationOptional<Date | null>;
  declare sentAt: CreationOptional<Date | null>;
  declare failedAt: CreationOptional<Date | null>;
  declare dedupeKey: CreationOptional<string | null>;
  declare channel: CreationOptional<string>;
  declare toEmail: string;
  declare template: string;
  declare subject: CreationOptional<string | null>;
  declare payloadJson: CreationOptional<string | null>;
  declare attemptCount: CreationOptional<number>;
  declare lastError: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initNotificationOutboxModel(
  sequelize: Sequelize,
): typeof NotificationOutbox {
  NotificationOutbox.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      status: {
        type: DataTypes.ENUM("PENDING", "SENDING", "SENT", "FAILED", "CANCELED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      scheduledAt: { type: DataTypes.DATE, allowNull: true },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      failedAt: { type: DataTypes.DATE, allowNull: true },
      dedupeKey: { type: DataTypes.STRING, allowNull: true, unique: true },
      channel: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "email",
      },
      toEmail: { type: DataTypes.STRING, allowNull: false },
      template: { type: DataTypes.STRING, allowNull: false },
      subject: { type: DataTypes.STRING, allowNull: true },
      payloadJson: { type: DataTypes.TEXT, allowNull: true },
      attemptCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      tableName: "notification_outbox",
      timestamps: true,
      indexes: [
        { fields: ["status"] },
        { fields: ["scheduledAt"] },
        { fields: ["createdAt"] },
      ],
    },
  );
  return NotificationOutbox;
}
