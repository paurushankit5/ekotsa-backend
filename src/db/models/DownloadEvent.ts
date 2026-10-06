import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class DownloadEvent extends Model<
  InferAttributes<DownloadEvent>,
  InferCreationAttributes<DownloadEvent>
> {
  declare id: CreationOptional<string>;
  declare registrationId: CreationOptional<string | null>;
  declare userId: CreationOptional<string | null>;
  declare productCode: CreationOptional<string | null>;
  declare installerVersion: CreationOptional<string | null>;
  declare platform: CreationOptional<string | null>;
  declare architecture: CreationOptional<string | null>;
  declare sourcePage: CreationOptional<string | null>;
  declare correlationId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initDownloadEventModel(sequelize: Sequelize): typeof DownloadEvent {
  DownloadEvent.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      registrationId: { type: DataTypes.STRING, allowNull: true },
      userId: { type: DataTypes.STRING, allowNull: true },
      productCode: { type: DataTypes.STRING, allowNull: true },
      installerVersion: { type: DataTypes.STRING, allowNull: true },
      platform: { type: DataTypes.STRING, allowNull: true },
      architecture: { type: DataTypes.STRING, allowNull: true },
      sourcePage: { type: DataTypes.STRING, allowNull: true },
      correlationId: { type: DataTypes.STRING, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { sequelize, tableName: "download_events", timestamps: true },
  );
  return DownloadEvent;
}
