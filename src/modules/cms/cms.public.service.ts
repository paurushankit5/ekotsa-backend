import {
  CmsArticle,
  CmsMenu,
  CmsMenuItem,
  CmsPage,
  CmsProduct,
  CmsSetting,
} from "../../db/models/index.js";
import {
  contentStatusFromDb,
  isPublished,
  productStatusFromDb,
  safeParseJson,
  toIso,
  type CmsArticleView,
  type CmsPageView,
  type CmsProductView,
} from "./cms.shared.js";
import { CmsPreviewService } from "./cms.preview.service.js";

function mapArticle(row: CmsArticle): CmsArticleView {
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

function mapProduct(row: CmsProduct): CmsProductView {
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

function mapPage(row: CmsPage): CmsPageView {
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

function filterVisibleArticle(article: CmsArticle): boolean {
  return isPublished(article.status, article.scheduledAt, article.archivedAt);
}

function filterVisibleProduct(product: CmsProduct): boolean {
  return (
    product.status !== "ARCHIVED" &&
    product.status !== "DISCONTINUED" &&
    product.status !== "PAUSED"
  );
}

function filterVisiblePage(page: CmsPage): boolean {
  return isPublished(page.status, page.scheduledAt, page.archivedAt);
}

function mapMenuPublic(menu: CmsMenu | null): CmsPublicMenuView | null {
  if (!menu) return null;
  return {
    id: menu.id,
    key: menu.key,
    label: menu.label,
    location: menu.location,
    items: (menu.items ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      href: item.href,
      note: item.note,
      style: item.style,
      orderIndex: item.orderIndex,
      isPrimary: item.isPrimary,
      openInNewTab: item.openInNewTab,
    })),
  };
}

export type CmsPublicMenuView = {
  id: string;
  key: string;
  label: string;
  location: string;
  items: Array<{
    id: string;
    label: string;
    href: string;
    note: string | null;
    style: string | null;
    orderIndex: number;
    isPrimary: boolean;
    openInNewTab: boolean;
  }>;
};

export const CmsPublicService = {
  async bootstrap(): Promise<{
    ok: true;
    menus: { header: CmsPublicMenuView | null; footer: CmsPublicMenuView | null };
    settings: Record<string, unknown>;
    products: CmsProductView[];
    articles: CmsArticleView[];
    pages: CmsPageView[];
  }> {
    const [header, footer, settings, products, articles, pages] = await Promise.all([
      this.getMenuByKey("header"),
      this.getMenuByKey("footer"),
      this.listSettingsMap(),
      this.listProducts(),
      this.listBlog(),
      this.listPages(),
    ]);

    return {
      ok: true,
      menus: { header, footer },
      settings,
      products,
      articles,
      pages,
    };
  },

  async getMenuByKey(key: string): Promise<CmsPublicMenuView | null> {
    const menu = await CmsMenu.findOne({
      where: { key, isActive: true },
      include: [
        {
          model: CmsMenuItem,
          as: "items",
          where: { isVisible: true },
          required: false,
        },
      ],
      order: [[{ model: CmsMenuItem, as: "items" }, "orderIndex", "ASC"]],
    });
    return mapMenuPublic(menu);
  },

  async listSettingsMap(): Promise<Record<string, unknown>> {
    const rows = await CmsSetting.findAll();
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      out[row.key] = safeParseJson(row.valueJson, row.valueJson);
    }
    return out;
  },

  async listBlog(): Promise<CmsArticleView[]> {
    const rows = await CmsArticle.findAll({
      where: { kind: "BLOG" },
      order: [
        ["sortOrder", "ASC"],
        ["publishedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.filter(filterVisibleArticle).map(mapArticle);
  },

  async getBlog(slug: string): Promise<CmsArticleView | null> {
    const row = await CmsArticle.findOne({ where: { kind: "BLOG", slug } });
    if (!row || !filterVisibleArticle(row)) return null;
    return mapArticle(row);
  },

  async listGuides(): Promise<CmsArticleView[]> {
    const rows = await CmsArticle.findAll({
      where: { kind: "GUIDE" },
      order: [
        ["sortOrder", "ASC"],
        ["publishedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.filter(filterVisibleArticle).map(mapArticle);
  },

  async getGuide(slug: string): Promise<CmsArticleView | null> {
    const row = await CmsArticle.findOne({ where: { kind: "GUIDE", slug } });
    if (!row || !filterVisibleArticle(row)) return null;
    return mapArticle(row);
  },

  async listProducts(): Promise<CmsProductView[]> {
    const rows = await CmsProduct.findAll({
      order: [
        ["sortOrder", "ASC"],
        ["publishedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.filter(filterVisibleProduct).map(mapProduct);
  },

  async getProduct(slug: string): Promise<CmsProductView | null> {
    const row = await CmsProduct.findOne({ where: { slug } });
    if (!row || !filterVisibleProduct(row)) return null;
    return mapProduct(row);
  },

  async listPages(): Promise<CmsPageView[]> {
    const rows = await CmsPage.findAll({
      order: [
        ["sortOrder", "ASC"],
        ["publishedAt", "DESC"],
        ["id", "DESC"],
      ],
    });
    return rows.filter(filterVisiblePage).map(mapPage);
  },

  async getPageByPath(path: string): Promise<CmsPageView | null> {
    const row = await CmsPage.findOne({ where: { path } });
    if (!row || !filterVisiblePage(row)) return null;
    return mapPage(row);
  },

  async resolvePreview(token: string) {
    return CmsPreviewService.getPreviewPayload(token);
  },
};
