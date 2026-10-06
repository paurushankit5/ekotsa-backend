import { createId } from "@paralleldrive/cuid2";
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export type PaymentStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "APPROVED"
  | "CLARIFICATION_REQUIRED"
  | "REJECTED"
  | "EXPIRED";

export class PaymentSubmission extends Model<
  InferAttributes<PaymentSubmission>,
  InferCreationAttributes<PaymentSubmission>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare registrationId: CreationOptional<string | null>;
  declare organizationId: CreationOptional<string | null>;
  declare deviceId: CreationOptional<string | null>;
  declare plan: string;
  declare amountPaise: number;
  declare referenceId: string;
  declare proofPath: CreationOptional<string | null>;
  declare proofBucket: CreationOptional<string | null>;
  declare status: CreationOptional<PaymentStatus>;
  declare verifiedAt: CreationOptional<Date | null>;
  declare rejectedAt: CreationOptional<Date | null>;
  declare adminNote: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initPaymentSubmissionModel(
  sequelize: Sequelize,
): typeof PaymentSubmission {
  PaymentSubmission.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
        defaultValue: () => createId(),
      },
      userId: { type: DataTypes.STRING, allowNull: false },
      registrationId: { type: DataTypes.STRING, allowNull: true },
      organizationId: { type: DataTypes.STRING, allowNull: true },
      deviceId: { type: DataTypes.STRING, allowNull: true },
      plan: { type: DataTypes.STRING, allowNull: false },
      amountPaise: { type: DataTypes.INTEGER, allowNull: false },
      referenceId: { type: DataTypes.STRING, allowNull: false },
      proofPath: { type: DataTypes.STRING, allowNull: true },
      proofBucket: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM(
          "PENDING",
          "UNDER_REVIEW",
          "VERIFIED",
          "APPROVED",
          "CLARIFICATION_REQUIRED",
          "REJECTED",
          "EXPIRED",
        ),
        allowNull: false,
        defaultValue: "PENDING",
      },
      verifiedAt: { type: DataTypes.DATE, allowNull: true },
      rejectedAt: { type: DataTypes.DATE, allowNull: true },
      adminNote: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { sequelize, tableName: "payment_submissions", timestamps: true },
  );
  return PaymentSubmission;
}
