import crypto from "node:crypto";
import { CmsPreviewToken, CmsRevision } from "../../db/models/index.js";
import { AppError } from "../../middleware/errorHandler.js";
import { writeAuditLog } from "../../services/audit-log.js";
import { safeParseJson } from "./cms.shared.js";

type Actor = {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
};

export type CmsPreviewPayload =
  | {
      state: "ok";
      token: {
        id: string;
        entityType: string;
        entityId: string;
        revisionVersion: number;
        targetPath: string;
        expiresAt: string;
      };
      revision: {
        id: string;
        entityType: string;
        entityId: string;
        version: number;
        createdAt: string;
      };
      snapshot: Record<string, unknown>;
    }
  | {
      state: "missing" | "expired" | "revoked";
    };

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export const CmsPreviewService = {
  async createPreviewLink(
    input: {
      entityType: string;
      entityId: string;
      revisionVersion: number;
      targetPath: string;
      note?: string | null;
      expiresInHours?: number;
    },
    actor: Actor,
  ): Promise<{
    previewUrl: string;
    tokenId: string;
    tokenHash: string;
    expiresAt: string;
    rawToken: string;
  }> {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + (input.expiresInHours ?? 48) * 60 * 60 * 1000,
    );

    const record = await CmsPreviewToken.create({
      tokenHash,
      entityType: input.entityType,
      entityId: input.entityId,
      revisionVersion: input.revisionVersion,
      targetPath: input.targetPath,
      expiresAt,
      createdByUserId: actor.userId,
      note: input.note ?? null,
    });

    await writeAuditLog({
      event: "cms.preview.create",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: input.entityType,
      targetId: input.entityId,
      meta: {
        tokenId: record.id,
        revisionVersion: input.revisionVersion,
        targetPath: input.targetPath,
      },
    });

    return {
      previewUrl: `/preview/${rawToken}`,
      tokenId: record.id,
      tokenHash: record.tokenHash,
      expiresAt: record.expiresAt.toISOString(),
      rawToken,
    };
  },

  async revokePreviewLink(
    tokenHash: string,
    actor: Actor,
  ): Promise<{ revokedAt: string | null }> {
    const record = await CmsPreviewToken.findOne({ where: { tokenHash } });
    if (!record) throw new AppError(404, "Preview token not found", "NOT_FOUND");
    await record.update({ revokedAt: new Date() });
    await writeAuditLog({
      event: "cms.preview.revoke",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: record.entityType,
      targetId: record.entityId,
      meta: { tokenHash },
    });
    return { revokedAt: record.revokedAt?.toISOString() ?? null };
  },

  async getPreviewPayload(rawToken: string): Promise<CmsPreviewPayload> {
    const tokenHash = hashToken(rawToken);
    const token = await CmsPreviewToken.findOne({ where: { tokenHash } });
    if (!token) return { state: "missing" };
    if (token.revokedAt) return { state: "revoked" };
    if (token.expiresAt.getTime() <= Date.now()) return { state: "expired" };

    await token.update({ lastUsedAt: new Date() });

    const revision = await CmsRevision.findOne({
      where: {
        entityType: token.entityType,
        entityId: token.entityId,
        version: token.revisionVersion,
      },
    });
    if (!revision) return { state: "missing" };
    const snapshot = safeParseJson<Record<string, unknown> | null>(
      revision.snapshotJson,
      null,
    );
    if (!snapshot) return { state: "missing" };

    return {
      state: "ok",
      token: {
        id: token.id,
        entityType: token.entityType,
        entityId: token.entityId,
        revisionVersion: token.revisionVersion,
        targetPath: token.targetPath,
        expiresAt: token.expiresAt.toISOString(),
      },
      revision: {
        id: revision.id,
        entityType: revision.entityType,
        entityId: revision.entityId,
        version: revision.version,
        createdAt: revision.createdAt.toISOString(),
      },
      snapshot,
    };
  },
};
