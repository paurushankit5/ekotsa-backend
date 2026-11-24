import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class GoogleOAuthTransaction extends Model<
  InferAttributes<GoogleOAuthTransaction>,
  InferCreationAttributes<GoogleOAuthTransaction>
> {
  declare id: CreationOptional<string>;
  declare provider: CreationOptional<string>;
  declare stateHash: string;
  declare nonce: string;
  declare codeVerifier: string;
  declare redirectUri: string;
  declare browserReturnTo: CreationOptional<string | null>;
  declare desktopCallbackUri: CreationOptional<string | null>;
  declare emailHint: CreationOptional<string | null>;
  declare exchangeCodeHash: CreationOptional<string | null>;
  declare browserExchangeCodeHash: CreationOptional<string | null>;
  declare browserExchangeExpiresAt: CreationOptional<Date | null>;
  declare browserExchangeConsumedAt: CreationOptional<Date | null>;
  declare adminExchangeCodeHash: CreationOptional<string | null>;
  declare adminExchangeExpiresAt: CreationOptional<Date | null>;
  declare adminExchangeConsumedAt: CreationOptional<Date | null>;
  declare userId: CreationOptional<string | null>;
  declare completedAt: CreationOptional<Date | null>;
  declare consumedAt: CreationOptional<Date | null>;
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initGoogleOAuthTransactionModel(
  sequelize: Sequelize,
): typeof GoogleOAuthTransaction {
  GoogleOAuthTransaction.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "GOOGLE",
      },
      stateHash: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      nonce: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      codeVerifier: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      redirectUri: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      browserReturnTo: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      desktopCallbackUri: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      emailHint: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      exchangeCodeHash: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      browserExchangeCodeHash: { type: DataTypes.STRING, allowNull: true, unique: true },
      browserExchangeExpiresAt: { type: DataTypes.DATE, allowNull: true },
      browserExchangeConsumedAt: { type: DataTypes.DATE, allowNull: true },
      adminExchangeCodeHash: { type: DataTypes.STRING, allowNull: true, unique: true },
      adminExchangeExpiresAt: { type: DataTypes.DATE, allowNull: true },
      adminExchangeConsumedAt: { type: DataTypes.DATE, allowNull: true },
      userId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      consumedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "google_oauth_transactions",
      timestamps: true,
      indexes: [
        { fields: ["provider"] },
        { fields: ["expiresAt"] },
        { fields: ["userId"] },
      ],
    },
  );

  return GoogleOAuthTransaction;
}
