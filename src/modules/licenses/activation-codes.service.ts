import { createHash, randomBytes } from "node:crypto";
import { Op } from "sequelize";
import { ActivationCode, Device } from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { LicenseService } from "../licenses/licenses.service.js";

function hashCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("base64url");
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]!);
  const raw = chars.join("");
  const parts = [raw.slice(0, 5), raw.slice(5, 10), raw.slice(10, 15), raw.slice(15, 20)].filter(
    Boolean,
  );
  return `EKOTSA-${parts.join("-")}`;
}

export const ActivationCodesService = {
  async generate(input: {
    plan: string;
    expiresInDays?: number;
  }): Promise<{
    activation: {
      id: string;
      plan: string;
      code: string;
      expiresAt: string;
      createdAt: string;
    };
  }> {
    const days = input.expiresInDays ?? 365;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      const codeHash = hashCode(code);
      try {
        const record = await ActivationCode.create({
          codeHash,
          plan: input.plan,
          expiresAt,
          redeemedByUserId: null,
          redeemedAt: null,
        });
        return {
          activation: {
            id: record.id,
            plan: record.plan,
            code,
            expiresAt: record.expiresAt.toISOString(),
            createdAt: record.createdAt.toISOString(),
          },
        };
      } catch {
        // retry on unique hash collision
      }
    }

    throw new AppError(500, "Failed to generate activation code", "CODE_GEN_FAILED");
  },

  async list(input: { limit?: number }): Promise<{
    codes: Array<{
      id: string;
      plan: string;
      expiresAt: string;
      redeemedByUserId: string | null;
      redeemedAt: string | null;
      status: "unused" | "used" | "expired";
      createdAt: string;
    }>;
  }> {
    const now = Date.now();
    const codes = await ActivationCode.findAll({
      order: [["createdAt", "DESC"]],
      limit: input.limit ?? 500,
    });

    return {
      codes: codes.map((c) => {
        let status: "unused" | "used" | "expired" = "unused";
        if (c.redeemedAt) status = "used";
        else if (c.expiresAt.getTime() < now) status = "expired";
        return {
          id: c.id,
          plan: c.plan,
          expiresAt: c.expiresAt.toISOString(),
          redeemedByUserId: c.redeemedByUserId,
          redeemedAt: c.redeemedAt?.toISOString() ?? null,
          status,
          createdAt: c.createdAt.toISOString(),
        };
      }),
    };
  },

  async redeem(input: {
    userId: string;
    code: string;
  }): Promise<{
    subscription: {
      active: true;
      plan: string;
      expiresAt: string;
    };
  }> {
    const codeHash = hashCode(input.code);
    const record = await ActivationCode.findOne({
      where: {
        codeHash,
        redeemedAt: null,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!record) {
      throw new AppError(400, "Invalid or already used activation code", "CODE_INVALID");
    }

    const device = await Device.findOne({
      where: { userId: input.userId, status: "ACTIVE" },
      order: [
        ["serverLastSeenAt", "DESC"],
        ["lastSeenAt", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    if (!device) {
      throw new AppError(
        400,
        "No active device to attach license. Register a device first.",
        "DEVICE_REQUIRED",
      );
    }

    const grantResult = await LicenseService.createGrant({
      userId: input.userId,
      deviceId: device.id,
      plan: record.plan,
      durationDays: 365,
      reason: `activation_code:${record.id}`,
    });

    await record.update({
      redeemedByUserId: input.userId,
      redeemedAt: new Date(),
    });

    return {
      subscription: {
        active: true,
        plan: grantResult.grant.plan,
        expiresAt: grantResult.grant.expiresAt,
      },
    };
  },
};
