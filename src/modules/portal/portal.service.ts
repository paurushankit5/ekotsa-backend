import { Op } from "sequelize";
import {
  Device,
  LicenseGrant,
  PaymentSubmission,
  RecoveryArtifact,
  User,
} from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { DeviceResetService } from "../devices/device-reset.service.js";
import { RecoveryService } from "../recovery/recovery.service.js";

export const PortalService = {
  async overview(userId: string): Promise<{
    portal: {
      user: { id: string; email: string; name: string | null; role: string };
      subscription: {
        plan: string | null;
        status: string | null;
        expiresAt: string | null;
      };
      devices: Array<{
        id: string;
        deviceName: string;
        platform: string;
        status: string;
        lastSeenAt: string | null;
      }>;
      grants: Array<{
        id: string;
        deviceId: string;
        plan: string;
        status: string;
        expiresAt: string;
      }>;
      payments: Array<{
        id: string;
        plan: string;
        status: string;
        amountPaise: number;
        createdAt: string;
      }>;
      recoveries: Array<{
        id: string;
        expiresAt: string;
        revokedAt: string | null;
        grantId: string | null;
      }>;
    };
  }> {
    const user = await User.findByPk(userId);
    if (!user) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");

    const now = new Date();
    const [devices, grants, payments, recoveries] = await Promise.all([
      Device.findAll({
        where: { userId },
        order: [["createdAt", "DESC"]],
        limit: 50,
      }),
      LicenseGrant.findAll({
        where: { userId },
        order: [["expiresAt", "DESC"]],
        limit: 50,
      }),
      PaymentSubmission.findAll({
        where: { userId },
        order: [["createdAt", "DESC"]],
        limit: 20,
      }),
      RecoveryArtifact.findAll({
        where: {
          userId,
          revokedAt: null,
          expiresAt: { [Op.gt]: now },
        },
        order: [["issuedAt", "DESC"]],
        limit: 20,
      }),
    ]);

    const activeGrant =
      grants.find(
        (g) =>
          g.status === "ACTIVE" &&
          !g.revokedAt &&
          !g.suspendedAt &&
          g.expiresAt.getTime() > now.getTime(),
      ) ?? null;

    return {
      portal: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        subscription: {
          plan: activeGrant?.plan ?? null,
          status: activeGrant?.status ?? null,
          expiresAt: activeGrant?.expiresAt.toISOString() ?? null,
        },
        devices: devices.map((d) => ({
          id: d.id,
          deviceName: d.deviceName,
          platform: d.platform,
          status: d.status,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
        })),
        grants: grants.map((g) => ({
          id: g.id,
          deviceId: g.deviceId,
          plan: g.plan,
          status: g.status,
          expiresAt: g.expiresAt.toISOString(),
        })),
        payments: payments.map((p) => ({
          id: p.id,
          plan: p.plan,
          status: p.status,
          amountPaise: p.amountPaise,
          createdAt: p.createdAt.toISOString(),
        })),
        recoveries: recoveries.map((r) => ({
          id: r.id,
          expiresAt: r.expiresAt.toISOString(),
          revokedAt: r.revokedAt?.toISOString() ?? null,
          grantId: r.grantId,
        })),
      },
    };
  },

  async deviceResets(userId: string) {
    return DeviceResetService.listForUser(userId);
  },

  async downloadRecovery(userId: string, id: string) {
    return RecoveryService.getDownloadableArtifact({
      id,
      userId,
      enforceValidity: true,
    });
  },
};
