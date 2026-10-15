import {
  CmsAsset,
  CmsMenu,
  CmsMenuItem,
  CmsRedirect,
  CmsSetting,
} from "../../db/models/index.js";
import type { CmsAssetKind } from "../../db/models/CmsAsset.js";
import type { CmsMenuLocation } from "../../db/models/CmsMenu.js";
import { AppError } from "../../middleware/errorHandler.js";
import { writeAuditLog } from "../../services/audit-log.js";
import { sequelize } from "../../db/sequelize.js";

type Actor = {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
};

export type MenuItemInput = {
  label: string;
  href: string;
  note?: string | null;
  style?: string | null;
  orderIndex?: number;
  isPrimary?: boolean;
  openInNewTab?: boolean;
  isVisible?: boolean;
};

export type CmsMenuView = {
  id: string;
  key: string;
  label: string;
  location: CmsMenuLocation;
  description: string | null;
  isActive: boolean;
  items: Array<{
    id: string;
    label: string;
    href: string;
    note: string | null;
    style: string | null;
    orderIndex: number;
    isPrimary: boolean;
    openInNewTab: boolean;
    isVisible: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
};

function mapMenu(menu: CmsMenu): CmsMenuView {
  const items = (menu.items ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    note: item.note,
    style: item.style,
    orderIndex: item.orderIndex,
    isPrimary: item.isPrimary,
    openInNewTab: item.openInNewTab,
    isVisible: item.isVisible,
  }));
  return {
    id: menu.id,
    key: menu.key,
    label: menu.label,
    location: menu.location,
    description: menu.description,
    isActive: menu.isActive,
    items,
    createdAt: menu.createdAt.toISOString(),
    updatedAt: menu.updatedAt.toISOString(),
  };
}

export const CmsOpsService = {
  async getMenu(key: string): Promise<CmsMenuView | null> {
    const menu = await CmsMenu.findOne({
      where: { key },
      include: [{ model: CmsMenuItem, as: "items" }],
      order: [[{ model: CmsMenuItem, as: "items" }, "orderIndex", "ASC"]],
    });
    if (!menu) return null;
    return mapMenu(menu);
  },

  async upsertMenu(
    input: {
      key: string;
      label: string;
      location: CmsMenuLocation | string;
      description?: string | null;
      isActive?: boolean;
      items?: MenuItemInput[];
    },
    actor: Actor,
  ): Promise<CmsMenuView> {
    const location: CmsMenuLocation = input.location === "FOOTER" ? "FOOTER" : "HEADER";
    const items = input.items ?? [];

    const result = await sequelize.transaction(async (tx) => {
      const existing = await CmsMenu.findOne({
        where: { key: input.key },
        transaction: tx,
      });
      let menu: CmsMenu;
      if (existing) {
        await existing.update(
          {
            label: input.label,
            location,
            description: input.description ?? null,
            isActive: input.isActive ?? true,
          },
          { transaction: tx },
        );
        menu = existing;
      } else {
        menu = await CmsMenu.create(
          {
            key: input.key,
            label: input.label,
            location,
            description: input.description ?? null,
            isActive: input.isActive ?? true,
          },
          { transaction: tx },
        );
      }

      await CmsMenuItem.destroy({ where: { menuId: menu.id }, transaction: tx });
      if (items.length) {
        await CmsMenuItem.bulkCreate(
          items.map((item, index) => ({
            menuId: menu.id,
            label: item.label,
            href: item.href,
            note: item.note ?? null,
            style: item.style ?? null,
            orderIndex: item.orderIndex ?? index,
            isPrimary: Boolean(item.isPrimary),
            openInNewTab: Boolean(item.openInNewTab),
            isVisible: item.isVisible === undefined ? true : Boolean(item.isVisible),
          })),
          { transaction: tx },
        );
      }

      const reloaded = await CmsMenu.findByPk(menu.id, {
        include: [{ model: CmsMenuItem, as: "items" }],
        order: [[{ model: CmsMenuItem, as: "items" }, "orderIndex", "ASC"]],
        transaction: tx,
      });
      return reloaded!;
    });

    await writeAuditLog({
      event: "cms.menu.save",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsMenu",
      targetId: result.id,
      meta: { key: result.key, location: result.location, itemCount: items.length },
    });

    return mapMenu(result);
  },

  async listSettings(): Promise<
    Array<{
      id: string;
      key: string;
      valueJson: string | null;
      note: string | null;
      updatedByUserId: string | null;
      updatedAt: string;
    }>
  > {
    const rows = await CmsSetting.findAll({ order: [["key", "ASC"]] });
    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      valueJson: row.valueJson,
      note: row.note,
      updatedByUserId: row.updatedByUserId,
      updatedAt: row.updatedAt.toISOString(),
    }));
  },

  async upsertSettings(
    input:
      | { key: string; valueJson?: string | null; note?: string | null }
      | {
          settings: Array<{ key: string; valueJson?: string | null; note?: string | null }>;
        },
    actor: Actor,
  ): Promise<{ ok: true; count: number }> {
    const entries =
      "settings" in input && Array.isArray(input.settings)
        ? input.settings
        : "key" in input
          ? [input]
          : [];

    for (const entry of entries) {
      const existing = await CmsSetting.findOne({ where: { key: entry.key } });
      if (existing) {
        await existing.update({
          valueJson: entry.valueJson ?? null,
          note: entry.note ?? null,
          updatedByUserId: actor.userId,
        });
      } else {
        await CmsSetting.create({
          key: entry.key,
          valueJson: entry.valueJson ?? null,
          note: entry.note ?? null,
          updatedByUserId: actor.userId,
        });
      }
      await writeAuditLog({
        event: "cms.setting.save",
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "CmsSetting",
        targetId: entry.key,
        meta: { key: entry.key },
      });
    }

    return { ok: true, count: entries.length };
  },

  async listRedirects(): Promise<
    Array<{
      id: string;
      sourcePath: string;
      destinationPath: string;
      statusCode: number;
      isActive: boolean;
      note: string | null;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const rows = await CmsRedirect.findAll({ order: [["sourcePath", "ASC"]] });
    return rows.map((row) => ({
      id: row.id,
      sourcePath: row.sourcePath,
      destinationPath: row.destinationPath,
      statusCode: row.statusCode,
      isActive: row.isActive,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },

  async upsertRedirect(
    input: {
      id?: string | null;
      sourcePath: string;
      destinationPath: string;
      statusCode?: number;
      isActive?: boolean;
      note?: string | null;
    },
    actor: Actor,
  ): Promise<{
    id: string;
    sourcePath: string;
    destinationPath: string;
    statusCode: number;
    isActive: boolean;
    note: string | null;
  }> {
    const existing = input.id
      ? await CmsRedirect.findByPk(input.id)
      : await CmsRedirect.findOne({ where: { sourcePath: input.sourcePath } });

    let redirect: CmsRedirect;
    if (existing) {
      await existing.update({
        sourcePath: input.sourcePath,
        destinationPath: input.destinationPath,
        statusCode: input.statusCode ?? 301,
        isActive: input.isActive ?? true,
        note: input.note ?? null,
      });
      redirect = existing;
    } else {
      redirect = await CmsRedirect.create({
        sourcePath: input.sourcePath,
        destinationPath: input.destinationPath,
        statusCode: input.statusCode ?? 301,
        isActive: input.isActive ?? true,
        note: input.note ?? null,
        createdByUserId: actor.userId,
      });
    }

    await writeAuditLog({
      event: "cms.redirect.save",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsRedirect",
      targetId: redirect.id,
      meta: {
        sourcePath: redirect.sourcePath,
        destinationPath: redirect.destinationPath,
      },
    });

    return {
      id: redirect.id,
      sourcePath: redirect.sourcePath,
      destinationPath: redirect.destinationPath,
      statusCode: redirect.statusCode,
      isActive: redirect.isActive,
      note: redirect.note,
    };
  },

  async deleteRedirect(id: string, actor: Actor): Promise<{ ok: true }> {
    const record = await CmsRedirect.findByPk(id);
    if (!record) throw new AppError(404, "Redirect not found", "NOT_FOUND");
    await record.destroy();
    await writeAuditLog({
      event: "cms.redirect.delete",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsRedirect",
      targetId: record.id,
      meta: { sourcePath: record.sourcePath },
    });
    return { ok: true };
  },

  async listAssets(): Promise<
    Array<{
      id: string;
      kind: CmsAssetKind;
      title: string;
      altText: string | null;
      sourceUrl: string;
      mimeType: string | null;
      sizeBytes: number | null;
      width: number | null;
      height: number | null;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const rows = await CmsAsset.findAll({ order: [["createdAt", "DESC"]] });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      altText: row.altText,
      sourceUrl: row.sourceUrl,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  },

  async upsertAsset(
    input: {
      id?: string | null;
      kind?: CmsAssetKind | string;
      title: string;
      sourceUrl: string;
      altText?: string | null;
      storageBucket?: string | null;
      storagePath?: string | null;
      mimeType?: string | null;
      sizeBytes?: number | null;
      width?: number | null;
      height?: number | null;
      checksum?: string | null;
      metadataJson?: string | null;
    },
    actor: Actor,
  ): Promise<{
    id: string;
    kind: CmsAssetKind;
    title: string;
    sourceUrl: string;
  }> {
    const kindRaw = input.kind ?? "IMAGE";
    const kind: CmsAssetKind =
      kindRaw === "FILE" || kindRaw === "VIDEO" ? kindRaw : "IMAGE";

    let asset: CmsAsset;
    if (input.id) {
      const existing = await CmsAsset.findByPk(input.id);
      if (!existing) throw new AppError(404, "Asset not found", "NOT_FOUND");
      await existing.update({
        title: input.title,
        sourceUrl: input.sourceUrl,
        kind,
        altText: input.altText ?? null,
        storageBucket: input.storageBucket ?? null,
        storagePath: input.storagePath ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        checksum: input.checksum ?? null,
        metadataJson: input.metadataJson ?? null,
      });
      asset = existing;
    } else {
      asset = await CmsAsset.create({
        title: input.title,
        sourceUrl: input.sourceUrl,
        kind,
        altText: input.altText ?? null,
        storageBucket: input.storageBucket ?? null,
        storagePath: input.storagePath ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        checksum: input.checksum ?? null,
        metadataJson: input.metadataJson ?? null,
        createdByUserId: actor.userId,
      });
    }

    await writeAuditLog({
      event: `cms.asset.${input.id ? "update" : "create"}`,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsAsset",
      targetId: asset.id,
      meta: { title: asset.title, kind: asset.kind },
    });

    return {
      id: asset.id,
      kind: asset.kind,
      title: asset.title,
      sourceUrl: asset.sourceUrl,
    };
  },

  async deleteAsset(id: string, actor: Actor): Promise<{ ok: true }> {
    const record = await CmsAsset.findByPk(id);
    if (!record) throw new AppError(404, "Asset not found", "NOT_FOUND");
    await record.destroy();
    await writeAuditLog({
      event: "cms.asset.delete",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsAsset",
      targetId: record.id,
      meta: { title: record.title, kind: record.kind },
    });
    return { ok: true };
  },
};
