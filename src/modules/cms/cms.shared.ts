import type { CmsContentStatus } from "../../db/models/CmsArticle.js";
import type { CmsProductDbStatus } from "../../db/models/CmsProduct.js";

export type CmsStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "unpublished"
  | "archived";

export type CmsWorkflowState =
  | "DRAFT"
  | "IN_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "ARCHIVED";

export type PublicProductStatus =
  | "available"
  | "pilot"
  | "early-access"
  | "in-development"
  | "coming-soon"
  | "beta"
  | "paused"
  | "archived"
  | "discontinued";

export type CmsArticleView = {
  id: string;
  kind: "BLOG" | "GUIDE";
  slug: string;
  title: string;
  excerpt: string;
  description: string;
  category: string;
  publishedAt: string;
  readingTime: string;
  coverLabel: string;
  keywords: string[];
  content: string[];
  relatedLinks: { label: string; href: string }[];
  seoTitle: string | null;
  seoDescription: string | null;
  status: CmsStatus;
  sortOrder: number;
  scheduledAt: string | null;
  archivedAt: string | null;
  publishedAtIso: string | null;
  version: number;
  publishedVersion: number | null;
};

export type CmsProductView = {
  id: string;
  slug: string;
  path: string;
  title: string;
  description: string;
  category: string;
  status: PublicProductStatus;
  features: string[];
  href: string;
  summary: string | null;
  heroLabel: string | null;
  benefits: string[];
  modules: string[];
  ctaPrimaryLabel: string | null;
  ctaPrimaryHref: string | null;
  ctaSecondaryLabel: string | null;
  ctaSecondaryHref: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  structuredDataJson: string | null;
  sortOrder: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  archivedAt: string | null;
  version: number;
  publishedVersion: number | null;
};

export type CmsPageView = {
  id: string;
  slug: string;
  path: string;
  title: string;
  summary: string | null;
  body: string[];
  sections: { heading: string; body: string[]; bullets?: string[] }[];
  seoTitle: string | null;
  seoDescription: string | null;
  status: CmsStatus;
  sortOrder: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  archivedAt: string | null;
  template: string | null;
  version: number;
  publishedVersion: number | null;
};

export function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function contentStatusFromDb(status: string): CmsStatus {
  return status.toLowerCase() as CmsStatus;
}

export function contentStatusToDb(status: CmsStatus): CmsContentStatus {
  switch (status) {
    case "draft":
      return "DRAFT";
    case "in_review":
      return "IN_REVIEW";
    case "changes_requested":
      return "CHANGES_REQUESTED";
    case "approved":
      return "APPROVED";
    case "scheduled":
      return "SCHEDULED";
    case "published":
      return "PUBLISHED";
    case "unpublished":
      return "UNPUBLISHED";
    case "archived":
      return "ARCHIVED";
    default:
      return "DRAFT";
  }
}

export function productStatusFromDb(status: string): PublicProductStatus {
  switch (status) {
    case "AVAILABLE":
      return "available";
    case "BETA":
      return "beta";
    case "EARLY_ACCESS":
      return "early-access";
    case "IN_DEVELOPMENT":
      return "in-development";
    case "COMING_SOON":
      return "coming-soon";
    case "PAUSED":
      return "paused";
    case "ARCHIVED":
      return "archived";
    case "DISCONTINUED":
      return "discontinued";
    case "PILOT":
      return "pilot";
    default:
      return "available";
  }
}

export function productStatusToDb(status: PublicProductStatus): CmsProductDbStatus {
  switch (status) {
    case "available":
      return "AVAILABLE";
    case "pilot":
      return "AVAILABLE";
    case "early-access":
      return "EARLY_ACCESS";
    case "in-development":
      return "IN_DEVELOPMENT";
    case "coming-soon":
      return "COMING_SOON";
    case "beta":
      return "BETA";
    case "paused":
      return "PAUSED";
    case "archived":
      return "ARCHIVED";
    case "discontinued":
      return "DISCONTINUED";
    default:
      return "AVAILABLE";
  }
}

export function isPublished(
  status: string,
  scheduledAt: Date | string | null | undefined,
  archivedAt: Date | string | null | undefined,
): boolean {
  if (status === "ARCHIVED" || status === "UNPUBLISHED") return false;
  if (archivedAt) return false;
  if (
    status === "DRAFT" ||
    status === "IN_REVIEW" ||
    status === "CHANGES_REQUESTED" ||
    status === "APPROVED"
  ) {
    return false;
  }
  if (!scheduledAt) return status === "PUBLISHED";
  const value = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(value.getTime())) return status === "PUBLISHED";
  return value.getTime() <= Date.now();
}

export function normalizeCmsStatus(value: unknown): CmsStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    raw === "draft" ||
    raw === "in_review" ||
    raw === "changes_requested" ||
    raw === "approved" ||
    raw === "scheduled" ||
    raw === "published" ||
    raw === "unpublished" ||
    raw === "archived"
  ) {
    return raw;
  }
  return "draft";
}

export function normalizeProductStatus(value: unknown): PublicProductStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    raw === "available" ||
    raw === "pilot" ||
    raw === "early-access" ||
    raw === "in-development" ||
    raw === "coming-soon" ||
    raw === "beta" ||
    raw === "paused" ||
    raw === "archived" ||
    raw === "discontinued"
  ) {
    return raw;
  }
  return "available";
}
