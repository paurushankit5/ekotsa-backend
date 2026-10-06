import { Op, fn, col, literal } from "sequelize";
import {
  AuditLog,
  ContactLead,
  CustomerRegistration,
  Device,
  DeviceResetRequest,
  LicenseGrant,
  NotificationOutbox,
  PaymentSubmission,
  RecoveryArtifact,
  RecoveryRequest,
  User,
} from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const v = cell ?? "";
          if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(","),
    )
    .join("\n");
}

export const AdminOpsService = {
  async listUsers(input?: { take?: number; skip?: number }): Promise<{
    users: Array<{
      id: string;
      email: string;
      name: string | null;
      role: string;
      emailVerified: boolean;
      trialStartedAt: string | null;
      createdAt: string;
    }>;
  }> {
    const users = await User.findAll({
      order: [["createdAt", "DESC"]],
      limit: input?.take ?? 100,
      offset: input?.skip ?? 0,
    });
    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        emailVerified: u.emailVerified,
        trialStartedAt: u.trialStartedAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
    };
  },

  async searchCustomers(input: { q: string; take?: number; skip?: number }): Promise<{
    customers: Array<{
      id: string;
      fullName: string;
      organizationName: string;
      email: string;
      status: string;
      linkedUserId: string | null;
      createdAt: string;
    }>;
  }> {
    if (input.q.trim().length < 2) {
      throw new AppError(400, "q must be at least 2 characters", "VALIDATION_ERROR");
    }
    const q = `%${input.q.trim().toLowerCase()}%`;
    const rows = await CustomerRegistration.findAll({
      where: {
        [Op.or]: [
          { normalizedEmail: { [Op.like]: q } },
          { fullName: { [Op.iLike]: q } },
          { organizationName: { [Op.iLike]: q } },
        ],
      },
      order: [["createdAt", "DESC"]],
      limit: input.take ?? 50,
      offset: input.skip ?? 0,
    });
    return {
      customers: rows.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        organizationName: r.organizationName,
        email: r.normalizedEmail,
        status: r.status,
        linkedUserId: r.linkedUserId,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  },

  async activeUsers(input?: { take?: number; skip?: number }): Promise<{
    users: Array<{
      registrationId: string;
      email: string;
      organizationName: string;
      status: string;
      linkedUserId: string | null;
      firstDeviceActivatedAt: string | null;
    }>;
  }> {
    const rows = await CustomerRegistration.findAll({
      where: {
        status: { [Op.in]: ["AUTHENTICATED", "DEVICE_ACTIVATED"] },
      },
      order: [["updatedAt", "DESC"]],
      limit: input?.take ?? 50,
      offset: input?.skip ?? 0,
    });
    return {
      users: rows.map((r) => ({
        registrationId: r.id,
        email: r.normalizedEmail,
        organizationName: r.organizationName,
        status: r.status,
        linkedUserId: r.linkedUserId,
        firstDeviceActivatedAt: r.firstDeviceActivatedAt?.toISOString() ?? null,
      })),
    };
  },

  async metrics(): Promise<{
    metrics: Record<string, number>;
  }> {
    const [
      users,
      payments,
      leads,
      licenses,
      resetPending,
      notifsPending,
      recoveriesPending,
    ] = await Promise.all([
      User.count(),
      PaymentSubmission.count(),
      ContactLead.count(),
      LicenseGrant.count({ where: { status: "ACTIVE" } }),
      DeviceResetRequest.count({ where: { status: "PENDING" } }),
      NotificationOutbox.count({ where: { status: "PENDING" } }),
      RecoveryRequest.count({ where: { status: "PENDING" } }),
    ]);
    return {
      metrics: {
        users,
        payments,
        leads,
        licensesActive: licenses,
        resetPending,
        notifsPending,
        recoveriesPending,
      },
    };
  },

  async opsSummary(): Promise<{
    summary: {
      resetPending: number;
      audit24h: Array<{ event: string; count: number }>;
      notifications: Array<{ status: string; count: number }>;
    };
  }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const resetPending = await DeviceResetRequest.count({ where: { status: "PENDING" } });

    const auditRows = await AuditLog.findAll({
      attributes: ["event", [fn("COUNT", col("id")), "count"]],
      where: { createdAt: { [Op.gte]: since } },
      group: ["event"],
      order: [[literal("count"), "DESC"]],
      limit: 30,
      raw: true,
    });

    const notifRows = await NotificationOutbox.findAll({
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true,
    });

    return {
      summary: {
        resetPending,
        audit24h: (auditRows as unknown as Array<{ event: string; count: string }>).map(
          (r) => ({ event: r.event, count: Number(r.count) }),
        ),
        notifications: (
          notifRows as unknown as Array<{ status: string; count: string }>
        ).map((r) => ({ status: r.status, count: Number(r.count) })),
      },
    };
  },

  async listLeads(input?: { take?: number }): Promise<{
    leads: Array<{
      id: string;
      name: string;
      organization: string;
      email: string;
      countryCode: string;
      phone: string;
      whatsapp: string;
      requirement: string | null;
      source: string;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const leads = await ContactLead.findAll({
      order: [["createdAt", "DESC"]],
      limit: input?.take ?? 200,
    });
    return {
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        organization: l.organization,
        email: l.email,
        countryCode: l.countryCode,
        phone: l.phone,
        whatsapp: l.whatsapp,
        requirement: l.requirement,
        source: l.source,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
    };
  },

  async abuseTrials(input?: { days?: number }): Promise<{
    suspects: Array<{
      userId: string;
      email: string;
      score: number;
      devices: number;
      resets: number;
      unpaid: number;
      verified: boolean;
    }>;
  }> {
    const days = input?.days ?? 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const users = await User.findAll({
      where: { createdAt: { [Op.gte]: since } },
      limit: 500,
      order: [["createdAt", "DESC"]],
    });

    const suspects = [];
    for (const user of users) {
      const [devices, resets, unpaid] = await Promise.all([
        Device.count({ where: { userId: user.id } }),
        DeviceResetRequest.count({ where: { userId: user.id } }),
        PaymentSubmission.count({
          where: {
            userId: user.id,
            status: { [Op.in]: ["PENDING", "UNDER_REVIEW", "REJECTED"] },
          },
        }),
      ]);
      let score = 0;
      if (devices >= 3) score += 2;
      if (resets >= 2) score += 3;
      if (!user.emailVerified) score += 2;
      if (unpaid >= 1 && devices >= 1) score += 1;
      if (score < 3) continue;
      suspects.push({
        userId: user.id,
        email: user.email,
        score,
        devices,
        resets,
        unpaid,
        verified: user.emailVerified,
      });
    }

    suspects.sort((a, b) => b.score - a.score);
    return { suspects: suspects.slice(0, 100) };
  },

  async supportTimeline(input: { q: string }): Promise<{
    timeline: Array<{
      at: string;
      type: string;
      id: string;
      summary: string;
    }>;
  }> {
    if (input.q.trim().length < 3) {
      throw new AppError(400, "q must be at least 3 characters", "VALIDATION_ERROR");
    }
    const q = input.q.trim().toLowerCase();
    const user = await User.findOne({
      where: { email: { [Op.iLike]: `%${q}%` } },
    });
    const registration = await CustomerRegistration.findOne({
      where: { normalizedEmail: { [Op.like]: `%${q}%` } },
    });
    const userId = user?.id ?? registration?.linkedUserId;
    if (!userId) return { timeline: [] };

    const [payments, resets, recoveries, grants, audits] = await Promise.all([
      PaymentSubmission.findAll({
        where: { userId },
        order: [["createdAt", "DESC"]],
        limit: 20,
      }),
      DeviceResetRequest.findAll({
        where: { userId },
        order: [["createdAt", "DESC"]],
        limit: 20,
      }),
      RecoveryRequest.findAll({
        where: { userId },
        order: [["requestedAt", "DESC"]],
        limit: 20,
      }),
      LicenseGrant.findAll({
        where: { userId },
        order: [["createdAt", "DESC"]],
        limit: 20,
      }),
      AuditLog.findAll({
        where: { actorUserId: userId },
        order: [["createdAt", "DESC"]],
        limit: 30,
      }),
    ]);

    const timeline = [
      ...payments.map((p) => ({
        at: p.createdAt.toISOString(),
        type: "payment",
        id: p.id,
        summary: `${p.status} ${p.plan} ₹${(p.amountPaise / 100).toFixed(0)}`,
      })),
      ...resets.map((r) => ({
        at: r.createdAt.toISOString(),
        type: "device_reset",
        id: r.id,
        summary: `reset ${r.status}`,
      })),
      ...recoveries.map((r) => ({
        at: r.requestedAt.toISOString(),
        type: "recovery",
        id: r.id,
        summary: `recovery ${r.status}`,
      })),
      ...grants.map((g) => ({
        at: g.createdAt.toISOString(),
        type: "grant",
        id: g.id,
        summary: `grant ${g.plan} ${g.status}`,
      })),
      ...audits.map((a) => ({
        at: a.createdAt.toISOString(),
        type: "audit",
        id: a.id,
        summary: a.event,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return { timeline: timeline.slice(0, 100) };
  },

  async exportCsv(
    kind: "recoveries" | "audit" | "payments" | "licenses",
  ): Promise<{ csv: string; filename: string }> {
    if (kind === "recoveries") {
      const rows = await RecoveryArtifact.findAll({
        order: [["issuedAt", "DESC"]],
        limit: 2000,
      });
      const csv = toCsv([
        ["id", "userId", "deviceId", "grantId", "issuedAt", "expiresAt", "revokedAt", "reason"],
        ...rows.map((r) => [
          r.id,
          r.userId,
          r.deviceId,
          r.grantId ?? "",
          r.issuedAt.toISOString(),
          r.expiresAt.toISOString(),
          r.revokedAt?.toISOString() ?? "",
          r.reason ?? "",
        ]),
      ]);
      return { csv, filename: "recoveries.csv" };
    }
    if (kind === "audit") {
      const rows = await AuditLog.findAll({
        order: [["createdAt", "DESC"]],
        limit: 5000,
      });
      const csv = toCsv([
        ["id", "createdAt", "event", "actorEmail", "targetType", "targetId", "severity"],
        ...rows.map((r) => [
          r.id,
          r.createdAt.toISOString(),
          r.event,
          r.actorEmail ?? "",
          r.targetType ?? "",
          r.targetId ?? "",
          r.severity,
        ]),
      ]);
      return { csv, filename: "audit.csv" };
    }
    if (kind === "payments") {
      const rows = await PaymentSubmission.findAll({
        order: [["createdAt", "DESC"]],
        limit: 2000,
      });
      const csv = toCsv([
        ["id", "userId", "plan", "amountPaise", "status", "referenceId", "createdAt"],
        ...rows.map((r) => [
          r.id,
          r.userId,
          r.plan,
          String(r.amountPaise),
          r.status,
          r.referenceId,
          r.createdAt.toISOString(),
        ]),
      ]);
      return { csv, filename: "payments.csv" };
    }
    const rows = await LicenseGrant.findAll({
      order: [["createdAt", "DESC"]],
      limit: 2000,
    });
    const csv = toCsv([
      ["id", "userId", "deviceId", "plan", "status", "expiresAt", "issuedAt"],
      ...rows.map((r) => [
        r.id,
        r.userId,
        r.deviceId,
        r.plan,
        r.status,
        r.expiresAt.toISOString(),
        r.issuedAt.toISOString(),
      ]),
    ]);
    return { csv, filename: "licenses.csv" };
  },
};
