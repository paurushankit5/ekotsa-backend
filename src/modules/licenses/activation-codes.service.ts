import { createHash } from "node:crypto";
import { Op } from "sequelize";
import { ActivationCode, Device } from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { LicenseService } from "../licenses/licenses.service.js";

function hashCode(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("base64url");
}

/**
 * Plan activation-code generation was removed (no plan-based sales). Listing and
 * redeeming codes that already exist remain until the UI phase decides their fate.
 */
export const ActivationCodesService = {
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
