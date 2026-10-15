import {
  CmsArticle,
  CmsPage,
  CmsProduct,
  CmsRevision,
  CmsWorkflowAction,
} from "../../db/models/index.js";
import type { CmsArticleKind, CmsContentStatus } from "../../db/models/CmsArticle.js";
import { AppError } from "../../middleware/errorHandler.js";
import { writeAuditLog } from "../../services/audit-log.js";
import {
  canTransitionCmsState,
  getCmsWorkflowActionTarget,
  type CmsWorkflowActionName,
  type CmsWorkflowState,
} from "./cms.workflow.js";
import {
  contentStatusFromDb,
  contentStatusToDb,
  normalizeCmsStatus,
  normalizeProductStatus,
  productStatusFromDb,
  productStatusToDb,
  safeParseJson,
  stringifyJson,
  toIso,
  type CmsArticleView,
  type CmsPageView,
  type CmsProductView,
  type CmsStatus,
  type PublicProductStatus,
} from "./cms.shared.js";

type Actor = {
  userId: string;
  email: string;
  role: "USER" | "ADMIN";
};

function normalizeWorkflowState(value: string | null | undefined): CmsWorkflowState {
  const raw = String(value ?? "").trim().toUpperCase();
  if (
    raw === "DRAFT" ||
    raw === "IN_REVIEW" ||
    raw === "CHANGES_REQUESTED" ||
    raw === "APPROVED" ||
    raw === "SCHEDULED" ||
    raw === "PUBLISHED" ||
    raw === "UNPUBLISHED" ||
    raw === "ARCHIVED"
  ) {
    return raw;
  }
  return "DRAFT";
}

function assertTransition(from: CmsWorkflowState, to: CmsWorkflowState): void {
  if (!canTransitionCmsState(from, to)) {
    throw new AppError(409, `Invalid transition ${from} → ${to}`, "CMS_INVALID_TRANSITION");
  }
}

async function writeRevision(params: {
  entityType: string;
  entityId: string;
  version: number;
  snapshot: unknown;
  note?: string | null;
  actorUserId?: string | null;
}): Promise<void> {
  await CmsRevision.create({
    entityType: params.entityType,
    entityId: params.entityId,
    version: params.version,
    snapshotJson: stringifyJson(params.snapshot) ?? "{}",
    note: params.note ?? null,
    createdByUserId: params.actorUserId ?? null,
  });
}

async function recordWorkflowAction(params: {
  entityType: string;
  entityId: string;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  actorUserId?: string | null;
}): Promise<void> {
  await CmsWorkflowAction.create({
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    fromStatus: params.fromStatus ?? null,
    toStatus: params.toStatus ?? null,
    note: params.note ?? null,
    actorUserId: params.actorUserId ?? null,
  });
}

function mapArticleView(row: CmsArticle): CmsArticleView {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    description: row.description,
    category: row.category,
    publishedAt: row.publishedLabel ?? row.publishedAt?.toISOString().slice(0, 10) ?? "",
    readingTime: row.readingTime ?? "",
    coverLabel: row.coverLabel ?? "",
    keywords: safeParseJson<string[]>(row.keywordsJson, []),
    content: safeParseJson<string[]>(row.contentJson, []),
    relatedLinks: safeParseJson<{ label: string; href: string }[]>(row.relatedLinksJson, []),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    status: contentStatusFromDb(row.status),
    sortOrder: row.sortOrder,
    scheduledAt: toIso(row.scheduledAt),
    archivedAt: toIso(row.archivedAt),
    publishedAtIso: toIso(row.publishedAt),
    version: row.version,
    publishedVersion: row.publishedVersion ?? null,
  };
}

function mapProductView(row: CmsProduct): CmsProductView {
  return {
    id: row.id,
    slug: row.slug,
    path: row.path,
    title: row.title,
    description: row.description,
    category: row.category ?? "",
    status: productStatusFromDb(row.status),
    features: safeParseJson<string[]>(row.featuresJson, []),
    benefits: safeParseJson<string[]>(row.benefitsJson, []),
    modules: safeParseJson<string[]>(row.modulesJson, []),
    href: row.path,
    summary: row.summary ?? null,
    heroLabel: row.heroLabel ?? null,
    ctaPrimaryLabel: row.ctaPrimaryLabel ?? null,
    ctaPrimaryHref: row.ctaPrimaryHref ?? null,
    ctaSecondaryLabel: row.ctaSecondaryLabel ?? null,
    ctaSecondaryHref: row.ctaSecondaryHref ?? null,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    structuredDataJson: row.structuredDataJson ?? null,
    sortOrder: row.sortOrder,
    publishedAt: toIso(row.publishedAt),
    scheduledAt: toIso(row.scheduledAt),
    archivedAt: toIso(row.archivedAt),
    version: row.version,
    publishedVersion: row.publishedVersion ?? null,
  };
}

function mapPageView(row: CmsPage): CmsPageView {
  return {
    id: row.id,
    slug: row.slug,
    path: row.path,
    title: row.title,
    summary: row.summary ?? null,
    body: safeParseJson<string[]>(row.bodyJson, []),
    sections: safeParseJson<{ heading: string; body: string[]; bullets?: string[] }[]>(
      row.sectionsJson,
      [],
    ),
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    status: contentStatusFromDb(row.status),
    sortOrder: row.sortOrder,
    publishedAt: toIso(row.publishedAt),
    scheduledAt: toIso(row.scheduledAt),
    archivedAt: toIso(row.archivedAt),
    template: row.template ?? null,
    version: row.version,
    publishedVersion: row.publishedVersion ?? null,
  };
}

function parseSnapshotJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") return safeParseJson(value, fallback);
  if (value === undefined || value === null) return fallback;
  return value as T;
}

export type UpsertArticleInput = {
  id?: string | null;
  kind: CmsArticleKind;
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  category: string;
  status?: CmsStatus | string;
  publishedLabel?: string | null;
  readingTime?: string | null;
  coverLabel?: string | null;
  keywords?: string[];
  content?: string[];
  relatedLinks?: { label: string; href: string }[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  scheduledAt?: string | null;
  sortOrder?: number;
  version?: number;
  featuredAssetId?: string | null;
  note?: string | null;
};

export type UpsertProductInput = {
  id?: string | null;
  slug: string;
  path: string;
  title: string;
  description: string;
  status?: PublicProductStatus | string;
  category?: string | null;
  heroLabel?: string | null;
  summary?: string | null;
  features?: string[];
  benefits?: string[];
  modules?: string[];
  ctaPrimaryLabel?: string | null;
  ctaPrimaryHref?: string | null;
  ctaSecondaryLabel?: string | null;
  ctaSecondaryHref?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  structuredDataJson?: string | null;
  scheduledAt?: string | null;
  sortOrder?: number;
  version?: number;
  featuredAssetId?: string | null;
  note?: string | null;
};

export type UpsertPageInput = {
  id?: string | null;
  slug: string;
  path: string;
  title: string;
  summary?: string | null;
  template?: string | null;
  body?: string[];
  sections?: { heading: string; body: string[]; bullets?: string[] }[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  status?: CmsStatus | string;
  scheduledAt?: string | null;
  sortOrder?: number;
  version?: number;
  featuredAssetId?: string | null;
  note?: string | null;
};

export const CmsContentService = {
  async listArticles(kind?: CmsArticleKind): Promise<CmsArticleView[]> {
    const where = kind ? { kind } : undefined;
    const rows = await CmsArticle.findAll({
      where,
      order: [
        ["sortOrder", "ASC"],
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.map(mapArticleView);
  },

  async getArticle(id: string): Promise<CmsArticleView> {
    const row = await CmsArticle.findByPk(id);
    if (!row) throw new AppError(404, "Article not found", "CMS_CONTENT_NOT_FOUND");
    return mapArticleView(row);
  },

  async upsertArticle(input: UpsertArticleInput, actor: Actor): Promise<CmsArticleView> {
    const status = normalizeCmsStatus(input.status);
    const existing = input.id
      ? await CmsArticle.findByPk(input.id)
      : await CmsArticle.findOne({ where: { kind: input.kind, slug: input.slug } });

    if (existing && input.version != null && existing.version !== input.version) {
      throw new AppError(
        409,
        `CMS version conflict for CmsArticle ${existing.id}`,
        "CMS_VERSION_CONFLICT",
      );
    }

    const nextVersion = existing ? existing.version + 1 : 1;
    const isPublished = status === "published";
    const nextStatus = contentStatusToDb(status);
    const payload = {
      kind: input.kind,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      description: input.description,
      category: input.category,
      publishedLabel: input.publishedLabel ?? null,
      readingTime: input.readingTime ?? null,
      coverLabel: input.coverLabel ?? null,
      keywordsJson: stringifyJson(input.keywords ?? []),
      contentJson: stringifyJson(input.content ?? []),
      relatedLinksJson: stringifyJson(input.relatedLinks ?? []),
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      status: nextStatus,
      sortOrder: input.sortOrder ?? 0,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      archivedAt: status === "archived" ? new Date() : (existing?.archivedAt ?? null),
      publishedAt: isPublished
        ? (existing?.publishedAt ?? new Date())
        : (existing?.publishedAt ?? null),
      version: nextVersion,
      publishedVersion: isPublished ? nextVersion : (existing?.publishedVersion ?? null),
      featuredAssetId: input.featuredAssetId ?? null,
      updatedByUserId: actor.userId,
      publishedByUserId: isPublished
        ? actor.userId
        : (existing?.publishedByUserId ?? null),
      archivedByUserId:
        status === "archived" ? actor.userId : (existing?.archivedByUserId ?? null),
    };

    let article: CmsArticle;
    if (existing) {
      await existing.update(payload);
      article = existing;
    } else {
      article = await CmsArticle.create({
        ...payload,
        createdByUserId: actor.userId,
      });
    }

    await writeRevision({
      entityType: `CmsArticle:${input.kind}`,
      entityId: article.id,
      version: article.version,
      snapshot: article.get({ plain: true }),
      note: input.note,
      actorUserId: actor.userId,
    });
    await recordWorkflowAction({
      entityType: `CmsArticle:${input.kind}`,
      entityId: article.id,
      action: existing ? "update" : "create",
      fromStatus: existing?.status ?? null,
      toStatus: article.status,
      note: input.note,
      actorUserId: actor.userId,
    });
    await writeAuditLog({
      event: `cms.article.${existing ? "update" : "create"}`,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsArticle",
      targetId: article.id,
      meta: { kind: input.kind, slug: article.slug, status: article.status, title: article.title },
    });

    return mapArticleView(article);
  },

  async deleteArticle(id: string, actor: Actor): Promise<{ ok: true }> {
    const record = await CmsArticle.findByPk(id);
    if (!record) throw new AppError(404, "Article not found", "CMS_CONTENT_NOT_FOUND");
    await record.destroy();
    await writeAuditLog({
      event: "cms.article.delete",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsArticle",
      targetId: record.id,
      meta: { kind: record.kind, slug: record.slug },
    });
    return { ok: true };
  },

  async listProducts(): Promise<CmsProductView[]> {
    const rows = await CmsProduct.findAll({
      order: [
        ["sortOrder", "ASC"],
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.map(mapProductView);
  },

  async getProduct(id: string): Promise<CmsProductView> {
    const row = await CmsProduct.findByPk(id);
    if (!row) throw new AppError(404, "Product not found", "CMS_CONTENT_NOT_FOUND");
    return mapProductView(row);
  },

  async upsertProduct(input: UpsertProductInput, actor: Actor): Promise<CmsProductView> {
    const status = normalizeProductStatus(input.status);
    const existing = input.id
      ? await CmsProduct.findByPk(input.id)
      : await CmsProduct.findOne({ where: { slug: input.slug } });

    if (existing && input.version != null && existing.version !== input.version) {
      throw new AppError(
        409,
        `CMS version conflict for CmsProduct ${existing.id}`,
        "CMS_VERSION_CONFLICT",
      );
    }

    const nextVersion = existing ? existing.version + 1 : 1;
    const isVisible = !["paused", "archived", "discontinued"].includes(status);
    const payload = {
      slug: input.slug,
      path: input.path,
      title: input.title,
      description: input.description,
      category: input.category ?? null,
      status: productStatusToDb(status),
      heroLabel: input.heroLabel ?? null,
      summary: input.summary ?? null,
      featuresJson: stringifyJson(input.features ?? []),
      benefitsJson: stringifyJson(input.benefits ?? []),
      modulesJson: stringifyJson(input.modules ?? []),
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      structuredDataJson: input.structuredDataJson ?? null,
      ctaPrimaryLabel: input.ctaPrimaryLabel ?? null,
      ctaPrimaryHref: input.ctaPrimaryHref ?? null,
      ctaSecondaryLabel: input.ctaSecondaryLabel ?? null,
      ctaSecondaryHref: input.ctaSecondaryHref ?? null,
      sortOrder: input.sortOrder ?? 0,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      archivedAt: status === "archived" ? new Date() : (existing?.archivedAt ?? null),
      publishedAt: isVisible
        ? (existing?.publishedAt ?? new Date())
        : (existing?.publishedAt ?? null),
      version: nextVersion,
      publishedVersion: isVisible ? nextVersion : (existing?.publishedVersion ?? null),
      featuredAssetId: input.featuredAssetId ?? null,
      updatedByUserId: actor.userId,
      publishedByUserId: isVisible ? actor.userId : (existing?.publishedByUserId ?? null),
      archivedByUserId:
        status === "archived" ? actor.userId : (existing?.archivedByUserId ?? null),
    };

    let product: CmsProduct;
    if (existing) {
      await existing.update(payload);
      product = existing;
    } else {
      product = await CmsProduct.create({
        ...payload,
        createdByUserId: actor.userId,
      });
    }

    await writeRevision({
      entityType: "CmsProduct",
      entityId: product.id,
      version: product.version,
      snapshot: product.get({ plain: true }),
      note: input.note,
      actorUserId: actor.userId,
    });
    await recordWorkflowAction({
      entityType: "CmsProduct",
      entityId: product.id,
      action: existing ? "update" : "create",
      fromStatus: existing?.status ?? null,
      toStatus: product.status,
      note: input.note,
      actorUserId: actor.userId,
    });
    await writeAuditLog({
      event: `cms.product.${existing ? "update" : "create"}`,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsProduct",
      targetId: product.id,
      meta: { slug: product.slug, status: product.status, title: product.title },
    });

    return mapProductView(product);
  },

  async deleteProduct(id: string, actor: Actor): Promise<{ ok: true }> {
    const record = await CmsProduct.findByPk(id);
    if (!record) throw new AppError(404, "Product not found", "CMS_CONTENT_NOT_FOUND");
    await record.destroy();
    await writeAuditLog({
      event: "cms.product.delete",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsProduct",
      targetId: record.id,
      meta: { slug: record.slug, path: record.path },
    });
    return { ok: true };
  },

  async listPages(): Promise<CmsPageView[]> {
    const rows = await CmsPage.findAll({
      order: [
        ["sortOrder", "ASC"],
        ["updatedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.map(mapPageView);
  },

  async getPage(id: string): Promise<CmsPageView> {
    const row = await CmsPage.findByPk(id);
    if (!row) throw new AppError(404, "Page not found", "CMS_CONTENT_NOT_FOUND");
    return mapPageView(row);
  },

  async upsertPage(input: UpsertPageInput, actor: Actor): Promise<CmsPageView> {
    const status = normalizeCmsStatus(input.status);
    const existing = input.id
      ? await CmsPage.findByPk(input.id)
      : await CmsPage.findOne({ where: { slug: input.slug } });

    if (existing && input.version != null && existing.version !== input.version) {
      throw new AppError(
        409,
        `CMS version conflict for CmsPage ${existing.id}`,
        "CMS_VERSION_CONFLICT",
      );
    }

    const nextVersion = existing ? existing.version + 1 : 1;
    const isPublished = status === "published";
    const payload = {
      slug: input.slug,
      path: input.path,
      title: input.title,
      summary: input.summary ?? null,
      template: input.template ?? null,
      bodyJson: stringifyJson(input.body ?? []),
      sectionsJson: stringifyJson(input.sections ?? []),
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      status: contentStatusToDb(status),
      sortOrder: input.sortOrder ?? 0,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      archivedAt: status === "archived" ? new Date() : (existing?.archivedAt ?? null),
      publishedAt: isPublished
        ? (existing?.publishedAt ?? new Date())
        : (existing?.publishedAt ?? null),
      version: nextVersion,
      publishedVersion: isPublished ? nextVersion : (existing?.publishedVersion ?? null),
      featuredAssetId: input.featuredAssetId ?? null,
      updatedByUserId: actor.userId,
      publishedByUserId: isPublished
        ? actor.userId
        : (existing?.publishedByUserId ?? null),
      archivedByUserId:
        status === "archived" ? actor.userId : (existing?.archivedByUserId ?? null),
    };

    let page: CmsPage;
    if (existing) {
      await existing.update(payload);
      page = existing;
    } else {
      page = await CmsPage.create({
        ...payload,
        createdByUserId: actor.userId,
      });
    }

    await writeRevision({
      entityType: "CmsPage",
      entityId: page.id,
      version: page.version,
      snapshot: page.get({ plain: true }),
      note: input.note,
      actorUserId: actor.userId,
    });
    await recordWorkflowAction({
      entityType: "CmsPage",
      entityId: page.id,
      action: existing ? "update" : "create",
      fromStatus: existing?.status ?? null,
      toStatus: page.status,
      note: input.note,
      actorUserId: actor.userId,
    });
    await writeAuditLog({
      event: `cms.page.${existing ? "update" : "create"}`,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsPage",
      targetId: page.id,
      meta: { slug: page.slug, path: page.path, status: page.status, title: page.title },
    });

    return mapPageView(page);
  },

  async deletePage(id: string, actor: Actor): Promise<{ ok: true }> {
    const record = await CmsPage.findByPk(id);
    if (!record) throw new AppError(404, "Page not found", "CMS_CONTENT_NOT_FOUND");
    await record.destroy();
    await writeAuditLog({
      event: "cms.page.delete",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsPage",
      targetId: record.id,
      meta: { slug: record.slug, path: record.path },
    });
    return { ok: true };
  },

  async listRevisions(
    entityType: string,
    entityId: string,
  ): Promise<
    Array<{
      id: string;
      entityType: string;
      entityId: string;
      version: number;
      note: string | null;
      createdByUserId: string | null;
      createdAt: string;
    }>
  > {
    const rows = await CmsRevision.findAll({
      where: { entityType, entityId },
      order: [["version", "DESC"]],
    });
    return rows.map((row) => ({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      version: row.version,
      note: row.note,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    }));
  },

  async transitionWorkflow(
    input: {
      entityType: string;
      entityId: string;
      action: CmsWorkflowActionName;
      note?: string | null;
      version: number;
      scheduledAt?: string | null;
    },
    actor: Actor,
  ): Promise<{ ok: true; status: string; version: number }> {
    if (input.entityType.startsWith("CmsArticle:")) {
      const kind: CmsArticleKind = input.entityType.endsWith("GUIDE") ? "GUIDE" : "BLOG";
      const current = await CmsArticle.findByPk(input.entityId);
      if (!current) throw new AppError(404, "Article not found", "CMS_CONTENT_NOT_FOUND");
      if (current.version !== input.version) {
        throw new AppError(
          409,
          `CMS version conflict for CmsArticle ${current.id}`,
          "CMS_VERSION_CONFLICT",
        );
      }

      const fromStatus = normalizeWorkflowState(current.status);
      const toStatus = getCmsWorkflowActionTarget(input.action);
      assertTransition(fromStatus, toStatus);
      if (input.action === "schedule" && !input.scheduledAt) {
        throw new AppError(400, "scheduledAt is required", "CMS_SCHEDULED_AT_REQUIRED");
      }

      const nextVersion = current.version + 1;
      const scheduledAt =
        input.action === "schedule"
          ? new Date(input.scheduledAt ?? "")
          : input.action === "cancel_schedule"
            ? null
            : current.scheduledAt;
      const publishedAt =
        toStatus === "PUBLISHED" ? (current.publishedAt ?? new Date()) : current.publishedAt;

      await current.update({
        status: contentStatusToDb(toStatus.toLowerCase() as CmsStatus),
        scheduledAt,
        publishedAt,
        archivedAt: toStatus === "ARCHIVED" ? new Date() : current.archivedAt,
        publishedVersion: toStatus === "PUBLISHED" ? nextVersion : current.publishedVersion,
        updatedByUserId: actor.userId,
        publishedByUserId:
          toStatus === "PUBLISHED" ? actor.userId : current.publishedByUserId,
        archivedByUserId: toStatus === "ARCHIVED" ? actor.userId : current.archivedByUserId,
        version: nextVersion,
      });

      await writeRevision({
        entityType: input.entityType,
        entityId: current.id,
        version: current.version,
        snapshot: current.get({ plain: true }),
        note: input.note,
        actorUserId: actor.userId,
      });
      await recordWorkflowAction({
        entityType: input.entityType,
        entityId: current.id,
        action: input.action,
        fromStatus: fromStatus,
        toStatus: current.status,
        note: input.note,
        actorUserId: actor.userId,
      });
      await writeAuditLog({
        event: "cms.workflow.transition",
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "CmsArticle",
        targetId: current.id,
        meta: {
          entityType: input.entityType,
          kind,
          fromStatus,
          toStatus: current.status,
          action: input.action,
        },
      });

      return { ok: true, status: current.status, version: current.version };
    }

    if (input.entityType === "CmsPage") {
      const current = await CmsPage.findByPk(input.entityId);
      if (!current) throw new AppError(404, "Page not found", "CMS_CONTENT_NOT_FOUND");
      if (current.version !== input.version) {
        throw new AppError(
          409,
          `CMS version conflict for CmsPage ${current.id}`,
          "CMS_VERSION_CONFLICT",
        );
      }

      const fromStatus = normalizeWorkflowState(current.status);
      const toStatus = getCmsWorkflowActionTarget(input.action);
      assertTransition(fromStatus, toStatus);
      if (input.action === "schedule" && !input.scheduledAt) {
        throw new AppError(400, "scheduledAt is required", "CMS_SCHEDULED_AT_REQUIRED");
      }

      const nextVersion = current.version + 1;
      const scheduledAt =
        input.action === "schedule"
          ? new Date(input.scheduledAt ?? "")
          : input.action === "cancel_schedule"
            ? null
            : current.scheduledAt;
      const publishedAt =
        toStatus === "PUBLISHED" ? (current.publishedAt ?? new Date()) : current.publishedAt;

      await current.update({
        status: contentStatusToDb(toStatus.toLowerCase() as CmsStatus),
        scheduledAt,
        publishedAt,
        archivedAt: toStatus === "ARCHIVED" ? new Date() : current.archivedAt,
        publishedVersion: toStatus === "PUBLISHED" ? nextVersion : current.publishedVersion,
        updatedByUserId: actor.userId,
        publishedByUserId:
          toStatus === "PUBLISHED" ? actor.userId : current.publishedByUserId,
        archivedByUserId: toStatus === "ARCHIVED" ? actor.userId : current.archivedByUserId,
        version: nextVersion,
      });

      await writeRevision({
        entityType: "CmsPage",
        entityId: current.id,
        version: current.version,
        snapshot: current.get({ plain: true }),
        note: input.note,
        actorUserId: actor.userId,
      });
      await recordWorkflowAction({
        entityType: "CmsPage",
        entityId: current.id,
        action: input.action,
        fromStatus,
        toStatus: current.status,
        note: input.note,
        actorUserId: actor.userId,
      });
      await writeAuditLog({
        event: "cms.workflow.transition",
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "CmsPage",
        targetId: current.id,
        meta: {
          entityType: "CmsPage",
          fromStatus,
          toStatus: current.status,
          action: input.action,
        },
      });

      return { ok: true, status: current.status, version: current.version };
    }

    throw new AppError(
      400,
      `Unsupported entity type: ${input.entityType}`,
      "CMS_TRANSITION_UNSUPPORTED",
    );
  },

  async restoreRevision(
    input: { entityType: string; entityId: string; version: number },
    actor: Actor,
  ): Promise<{ ok: true; version: number }> {
    const revision = await CmsRevision.findOne({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
        version: input.version,
      },
    });
    if (!revision) throw new AppError(404, "Revision not found", "CMS_CONTENT_NOT_FOUND");
    const snapshot = safeParseJson<Record<string, unknown>>(revision.snapshotJson, {});
    if (!Object.keys(snapshot).length) {
      throw new AppError(400, "Invalid revision snapshot", "CMS_VALIDATION_FAILED");
    }

    if (input.entityType.startsWith("CmsArticle:")) {
      const current = await CmsArticle.findByPk(input.entityId);
      if (!current) throw new AppError(404, "Article not found", "CMS_CONTENT_NOT_FOUND");
      const fromStatus = current.status;
      const nextVersion = current.version + 1;
      await current.update({
        title: String(snapshot.title ?? current.title),
        excerpt: String(snapshot.excerpt ?? current.excerpt),
        description: String(snapshot.description ?? current.description),
        category: String(snapshot.category ?? current.category),
        publishedLabel:
          (snapshot.publishedLabel as string | null | undefined) ?? current.publishedLabel,
        readingTime: (snapshot.readingTime as string | null | undefined) ?? current.readingTime,
        coverLabel: (snapshot.coverLabel as string | null | undefined) ?? current.coverLabel,
        keywordsJson: stringifyJson(
          parseSnapshotJson(snapshot.keywordsJson, safeParseJson(current.keywordsJson, [])),
        ),
        contentJson: stringifyJson(
          parseSnapshotJson(snapshot.contentJson, safeParseJson(current.contentJson, [])),
        ),
        relatedLinksJson: stringifyJson(
          parseSnapshotJson(
            snapshot.relatedLinksJson,
            safeParseJson(current.relatedLinksJson, []),
          ),
        ),
        seoTitle: (snapshot.seoTitle as string | null | undefined) ?? current.seoTitle,
        seoDescription:
          (snapshot.seoDescription as string | null | undefined) ?? current.seoDescription,
        status: "DRAFT" as CmsContentStatus,
        publishedAt: current.publishedAt,
        scheduledAt: null,
        archivedAt: null,
        version: nextVersion,
        publishedVersion: current.publishedVersion,
        updatedByUserId: actor.userId,
      });
      await writeRevision({
        entityType: input.entityType,
        entityId: current.id,
        version: current.version,
        snapshot: current.get({ plain: true }),
        note: `Rollback to revision ${input.version}`,
        actorUserId: actor.userId,
      });
      await recordWorkflowAction({
        entityType: input.entityType,
        entityId: current.id,
        action: "rollback",
        fromStatus,
        toStatus: current.status,
        note: `Rollback to revision ${input.version}`,
        actorUserId: actor.userId,
      });
      await writeAuditLog({
        event: "cms.revision.rollback",
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "CmsArticle",
        targetId: current.id,
        meta: { entityType: input.entityType, version: input.version },
      });
      return { ok: true, version: current.version };
    }

    if (input.entityType === "CmsProduct") {
      const current = await CmsProduct.findByPk(input.entityId);
      if (!current) throw new AppError(404, "Product not found", "CMS_CONTENT_NOT_FOUND");
      const nextVersion = current.version + 1;
      await current.update({
        title: String(snapshot.title ?? current.title),
        description: String(snapshot.description ?? current.description),
        category: (snapshot.category as string | null | undefined) ?? current.category,
        heroLabel: (snapshot.heroLabel as string | null | undefined) ?? current.heroLabel,
        summary: (snapshot.summary as string | null | undefined) ?? current.summary,
        featuresJson: stringifyJson(
          parseSnapshotJson(snapshot.featuresJson, safeParseJson(current.featuresJson, [])),
        ),
        benefitsJson: stringifyJson(
          parseSnapshotJson(snapshot.benefitsJson, safeParseJson(current.benefitsJson, [])),
        ),
        modulesJson: stringifyJson(
          parseSnapshotJson(snapshot.modulesJson, safeParseJson(current.modulesJson, [])),
        ),
        seoTitle: (snapshot.seoTitle as string | null | undefined) ?? current.seoTitle,
        seoDescription:
          (snapshot.seoDescription as string | null | undefined) ?? current.seoDescription,
        structuredDataJson:
          (snapshot.structuredDataJson as string | null | undefined) ??
          current.structuredDataJson,
        ctaPrimaryLabel:
          (snapshot.ctaPrimaryLabel as string | null | undefined) ?? current.ctaPrimaryLabel,
        ctaPrimaryHref:
          (snapshot.ctaPrimaryHref as string | null | undefined) ?? current.ctaPrimaryHref,
        ctaSecondaryLabel:
          (snapshot.ctaSecondaryLabel as string | null | undefined) ??
          current.ctaSecondaryLabel,
        ctaSecondaryHref:
          (snapshot.ctaSecondaryHref as string | null | undefined) ?? current.ctaSecondaryHref,
        status: "AVAILABLE",
        publishedAt: current.publishedAt,
        scheduledAt: null,
        archivedAt: null,
        version: nextVersion,
        publishedVersion: current.publishedVersion,
        updatedByUserId: actor.userId,
      });
      await writeRevision({
        entityType: input.entityType,
        entityId: current.id,
        version: current.version,
        snapshot: current.get({ plain: true }),
        note: `Rollback to revision ${input.version}`,
        actorUserId: actor.userId,
      });
      await writeAuditLog({
        event: "cms.revision.rollback",
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "CmsProduct",
        targetId: current.id,
        meta: { entityType: input.entityType, version: input.version },
      });
      return { ok: true, version: current.version };
    }

    const current = await CmsPage.findByPk(input.entityId);
    if (!current) throw new AppError(404, "Page not found", "CMS_CONTENT_NOT_FOUND");
    const fromStatus = current.status;
    const nextVersion = current.version + 1;
    await current.update({
      title: String(snapshot.title ?? current.title),
      summary: (snapshot.summary as string | null | undefined) ?? current.summary,
      template: (snapshot.template as string | null | undefined) ?? current.template,
      bodyJson: stringifyJson(
        parseSnapshotJson(snapshot.bodyJson, safeParseJson(current.bodyJson, [])),
      ),
      sectionsJson: stringifyJson(
        parseSnapshotJson(snapshot.sectionsJson, safeParseJson(current.sectionsJson, [])),
      ),
      seoTitle: (snapshot.seoTitle as string | null | undefined) ?? current.seoTitle,
      seoDescription:
        (snapshot.seoDescription as string | null | undefined) ?? current.seoDescription,
      status: "DRAFT" as CmsContentStatus,
      publishedAt: current.publishedAt,
      scheduledAt: null,
      archivedAt: null,
      version: nextVersion,
      publishedVersion: current.publishedVersion,
      updatedByUserId: actor.userId,
    });
    await writeRevision({
      entityType: input.entityType,
      entityId: current.id,
      version: current.version,
      snapshot: current.get({ plain: true }),
      note: `Rollback to revision ${input.version}`,
      actorUserId: actor.userId,
    });
    await recordWorkflowAction({
      entityType: input.entityType,
      entityId: current.id,
      action: "rollback",
      fromStatus,
      toStatus: current.status,
      note: `Rollback to revision ${input.version}`,
      actorUserId: actor.userId,
    });
    await writeAuditLog({
      event: "cms.revision.rollback",
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      targetType: "CmsPage",
      targetId: current.id,
      meta: { entityType: input.entityType, version: input.version },
    });
    return { ok: true, version: current.version };
  },
};
