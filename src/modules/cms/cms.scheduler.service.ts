import { Op, QueryTypes } from "sequelize";
import {
  CmsArticle,
  CmsPage,
  CmsRevision,
  CmsWorkflowAction,
} from "../../db/models/index.js";
import { sequelize } from "../../db/sequelize.js";
import { writeAuditLog } from "../../services/audit-log.js";
import { contentStatusToDb, stringifyJson } from "./cms.shared.js";
import { type CmsWorkflowState } from "./cms.workflow.js";

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

async function writeRevision(
  entityType: string,
  entityId: string,
  version: number,
  snapshot: unknown,
): Promise<void> {
  await CmsRevision.create({
    entityType,
    entityId,
    version,
    snapshotJson: stringifyJson(snapshot) ?? "{}",
  });
}

async function withCmsSchedulerLock<T>(
  handler: () => Promise<T>,
): Promise<{ acquired: boolean; result: T | null }> {
  try {
    const rows = await sequelize.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext('ekotsa_cms_scheduler')) AS locked`,
      { type: QueryTypes.SELECT },
    );
    const locked = Boolean(rows[0]?.locked);
    if (!locked) {
      return { acquired: false, result: null };
    }
    try {
      const result = await handler();
      return { acquired: true, result };
    } finally {
      await sequelize.query(
        `SELECT pg_advisory_unlock(hashtext('ekotsa_cms_scheduler'))`,
      );
    }
  } catch {
    // Non-Postgres or lock unavailable — still process once.
    const result = await handler();
    return { acquired: true, result };
  }
}

async function publishArticle(article: CmsArticle, now: Date): Promise<void> {
  const entityType = `CmsArticle:${article.kind}`;
  const nextVersion = article.version + 1;
  const fromStatus = normalizeWorkflowState(article.status);

  await article.update({
    status: contentStatusToDb("published"),
    scheduledAt: null,
    publishedAt: article.publishedAt ?? now,
    publishedVersion: nextVersion,
    version: nextVersion,
  });

  await writeRevision(entityType, article.id, article.version, article.get({ plain: true }));
  await CmsWorkflowAction.create({
    entityType,
    entityId: article.id,
    action: "publish",
    fromStatus,
    toStatus: article.status,
    note: "Scheduled publication processed.",
  });
  await writeAuditLog({
    event: "cms.schedule.processed",
    targetType: "CmsArticle",
    targetId: article.id,
    meta: { entityType, version: article.version, status: article.status },
  });
}

async function publishPage(page: CmsPage, now: Date): Promise<void> {
  const nextVersion = page.version + 1;
  const fromStatus = normalizeWorkflowState(page.status);

  await page.update({
    status: contentStatusToDb("published"),
    scheduledAt: null,
    publishedAt: page.publishedAt ?? now,
    publishedVersion: nextVersion,
    version: nextVersion,
  });

  await writeRevision("CmsPage", page.id, page.version, page.get({ plain: true }));
  await CmsWorkflowAction.create({
    entityType: "CmsPage",
    entityId: page.id,
    action: "publish",
    fromStatus,
    toStatus: page.status,
    note: "Scheduled publication processed.",
  });
  await writeAuditLog({
    event: "cms.schedule.processed",
    targetType: "CmsPage",
    targetId: page.id,
    meta: { entityType: "CmsPage", version: page.version, status: page.status },
  });
}

export const CmsSchedulerService = {
  async processScheduled(now = new Date()): Promise<{
    acquired: boolean;
    articles: number;
    pages: number;
    total: number;
  }> {
    const locked = await withCmsSchedulerLock(async () => {
      const [articles, pages] = await Promise.all([
        CmsArticle.findAll({
          where: {
            status: "SCHEDULED",
            scheduledAt: { [Op.lte]: now },
          },
          order: [
            ["scheduledAt", "ASC"],
            ["updatedAt", "ASC"],
          ],
          limit: 100,
        }),
        CmsPage.findAll({
          where: {
            status: "SCHEDULED",
            scheduledAt: { [Op.lte]: now },
          },
          order: [
            ["scheduledAt", "ASC"],
            ["updatedAt", "ASC"],
          ],
          limit: 100,
        }),
      ]);

      for (const article of articles) {
        await publishArticle(article, now);
      }
      for (const page of pages) {
        await publishPage(page, now);
      }

      return {
        articles: articles.length,
        pages: pages.length,
        total: articles.length + pages.length,
      };
    });

    if (!locked.acquired || !locked.result) {
      return { acquired: false, articles: 0, pages: 0, total: 0 };
    }

    return {
      acquired: true,
      articles: locked.result.articles,
      pages: locked.result.pages,
      total: locked.result.total,
    };
  },
};
