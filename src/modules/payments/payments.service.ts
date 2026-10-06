import { createId } from "@paralleldrive/cuid2";
import { loadEnv } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  CustomerRegistration,
  Device,
  PaymentSubmission,
} from "../../db/models/index.js";
import { getObjectStorage } from "../../services/local-object-storage.js";
import type { ProtectedUploadResult } from "../../services/object-storage.js";
import { LicenseService } from "../licenses/licenses.service.js";

const PLAN_AMOUNTS: Record<string, number> = {
  trial: 0,
  standard: 999900, // ₹9,999 in paise
  annual: 999900,
};

type PaymentPublic = {
  id: string;
  plan?: string;
  amountPaise?: number;
  referenceId: string;
  status: string;
  verifiedAt?: string | null;
};

export const PaymentsService = {
  getQr(): {
    upiId: string;
    payeeName: string;
    note: string;
    qrImageUrl: string | null;
  } {
    const env = loadEnv();
    return {
      upiId: env.PAYMENT_UPI_ID ?? "ekotsa@upi",
      payeeName: env.PAYMENT_PAYEE_NAME ?? "Ekotsa",
      note: "Ekotsa Atithi license",
      qrImageUrl: env.PAYMENT_QR_IMAGE_URL ?? null,
    };
  },

  async startSubmission(input: {
    userId: string;
    plan: string;
    referenceId?: string;
    deviceId?: string;
    contentType: string;
    size: number;
  }): Promise<{
    payment: PaymentPublic & { plan: string; amountPaise: number };
    upload: ProtectedUploadResult;
  }> {
    const amountPaise = PLAN_AMOUNTS[input.plan] ?? PLAN_AMOUNTS.standard;
    const registration = await CustomerRegistration.findOne({
      where: { linkedUserId: input.userId },
    });

    if (input.deviceId) {
      const device = await Device.findByPk(input.deviceId);
      if (!device || device.userId !== input.userId) {
        throw new AppError(404, "Device not found", "DEVICE_NOT_FOUND");
      }
    }

    const referenceId = input.referenceId?.trim() || `PAY-${createId().slice(0, 10).toUpperCase()}`;
    const bucket = loadEnv().STORAGE_BUCKET ?? "payment-proofs";
    const path = `${input.userId}/${createId()}`;

    const upload = await getObjectStorage().createProtectedUpload({
      bucket,
      path,
      contentType: input.contentType,
      size: input.size,
    });

    const payment = await PaymentSubmission.create({
      userId: input.userId,
      registrationId: registration?.id ?? null,
      organizationId: registration?.organizationId ?? null,
      deviceId: input.deviceId ?? null,
      plan: input.plan,
      amountPaise,
      referenceId,
      proofPath: path,
      proofBucket: bucket,
      status: "PENDING",
    });

    return {
      payment: {
        id: payment.id,
        plan: payment.plan,
        amountPaise: payment.amountPaise,
        referenceId: payment.referenceId,
        status: payment.status,
      },
      upload,
    };
  },

  async confirm(input: {
    userId: string;
    paymentId: string;
    body?: Buffer;
    contentType?: string;
  }): Promise<{ payment: PaymentPublic }> {
    const payment = await PaymentSubmission.findByPk(input.paymentId);
    if (!payment || payment.userId !== input.userId) {
      throw new AppError(404, "Payment not found", "PAYMENT_NOT_FOUND");
    }
    if (!payment.proofPath || !payment.proofBucket) {
      throw new AppError(400, "Payment has no proof path", "PAYMENT_NO_PROOF");
    }

    if (input.body && input.body.length > 0) {
      await getObjectStorage().putObject({
        bucket: payment.proofBucket,
        path: payment.proofPath,
        contentType: input.contentType ?? "application/octet-stream",
        body: input.body,
      });
    } else {
      const info = await getObjectStorage().getProtectedObjectInfo({
        bucket: payment.proofBucket,
        path: payment.proofPath,
      });
      if (!info || info.size <= 0) {
        throw new AppError(400, "Payment proof not uploaded yet", "PROOF_MISSING");
      }
    }

    await payment.update({ status: "UNDER_REVIEW" });
    return {
      payment: {
        id: payment.id,
        status: payment.status,
        referenceId: payment.referenceId,
      },
    };
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
