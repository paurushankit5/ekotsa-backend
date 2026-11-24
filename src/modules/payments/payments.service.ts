import { AppError } from "../../middleware/errorHandler.js";
import { PaymentSubmission } from "../../db/models/index.js";
import { getObjectStorage } from "../../services/local-object-storage.js";
import { LicenseService } from "../licenses/licenses.service.js";

type PaymentPublic = {
  id: string;
  plan?: string;
  amountPaise?: number;
  referenceId: string;
  status: string;
  verifiedAt?: string | null;
};

export const PaymentsService = {
  async assertProofAccess(input: { userId: string; role: "USER" | "ADMIN"; bucket: string; path: string }) {
    if (input.role === "ADMIN") return;
    const payment = await PaymentSubmission.findOne({
      where: { userId: input.userId, proofBucket: input.bucket, proofPath: input.path },
      attributes: ["id"],
    });
    if (!payment) throw new AppError(404, "Proof not found", "PROOF_NOT_FOUND");
  },

  async list(input: { status?: string; limit?: number }): Promise<{
    payments: Array<{
      id: string;
      userId: string;
      deviceId: string | null;
      plan: string;
      amountPaise: number;
      referenceId: string;
      status: string;
      proofPath: string | null;
      createdAt: string;
      verifiedAt: string | null;
    }>;
  }> {
    const where = input.status ? { status: input.status as never } : {};
    const payments = await PaymentSubmission.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: input.limit ?? 50,
    });
    return {
      payments: payments.map((p) => ({
        id: p.id,
        userId: p.userId,
        deviceId: p.deviceId,
        plan: p.plan,
        amountPaise: p.amountPaise,
        referenceId: p.referenceId,
        status: p.status,
        proofPath: p.proofPath,
        createdAt: p.createdAt.toISOString(),
        verifiedAt: p.verifiedAt?.toISOString() ?? null,
      })),
    };
  },

  async verify(input: {
    paymentId: string;
    approve: boolean;
    adminNote?: string;
    durationDays?: number;
    deviceId?: string;
  }): Promise<{
    payment: PaymentPublic;
    grant: {
      id: string;
      userId: string;
      deviceId: string;
      plan: string;
      status: string;
      issuedAt: string;
      expiresAt: string;
      extended: boolean;
    } | null;
  }> {
    const payment = await PaymentSubmission.findByPk(input.paymentId);
    if (!payment) throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");

    if (!input.approve) {
      await payment.update({
        status: "REJECTED",
        rejectedAt: new Date(),
        adminNote: input.adminNote ?? null,
      });
      return { payment: { id: payment.id, status: payment.status, referenceId: payment.referenceId }, grant: null };
    }

    const deviceId = input.deviceId ?? payment.deviceId;
    if (!deviceId) {
      throw new AppError(
        400,
        "deviceId required to issue license grant",
        "DEVICE_REQUIRED",
      );
    }

    const grantResult = await LicenseService.createGrant({
      userId: payment.userId,
      deviceId,
      plan: payment.plan,
      durationDays: input.durationDays ?? 365,
      reason: `payment:${payment.id}`,
    });

    await payment.update({
      status: "APPROVED",
      verifiedAt: new Date(),
      adminNote: input.adminNote ?? null,
      deviceId,
    });

    return {
      payment: {
        id: payment.id,
        status: payment.status,
        referenceId: payment.referenceId,
        verifiedAt: payment.verifiedAt?.toISOString() ?? null,
      },
      grant: grantResult.grant,
    };
  },

  async proofReadUrl(paymentId: string): Promise<{ url: string | null }> {
    const payment = await PaymentSubmission.findByPk(paymentId);
    if (!payment?.proofBucket || !payment.proofPath) {
      throw new AppError(404, "Proof not found", "PROOF_NOT_FOUND");
    }
    const url = await getObjectStorage().createProtectedReadUrl({
      bucket: payment.proofBucket,
      path: payment.proofPath,
    });
    return { url };
  },

  async updateNote(input: {
    paymentId: string;
    note: string;
  }): Promise<{ payment: { id: string; adminNote: string } }> {
    const payment = await PaymentSubmission.findByPk(input.paymentId);
    if (!payment) {
      throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
    }
    await payment.update({ adminNote: input.note.trim() });
    return {
      payment: {
        id: payment.id,
        adminNote: payment.adminNote ?? input.note.trim(),
      },
    };
  },
};
