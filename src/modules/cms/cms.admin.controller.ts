import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { AppError } from "../../middleware/errorHandler.js";
import { requireCmsPermission } from "./cms.permissions.js";
import { CmsContentService } from "./cms.content.service.js";
import { CmsOpsService } from "./cms.ops.service.js";
import { CmsPreviewService } from "./cms.preview.service.js";
import { CmsSchedulerService } from "./cms.scheduler.service.js";
import {
  getCmsWorkflowActionPermission,
  type CmsWorkflowActionName,
} from "./cms.workflow.js";
import { loadEnv } from "../../config/env.js";

function actorFrom(req: Request) {
  if (!req.userSession) throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  return {
    userId: req.userSession.userId,
    email: req.userSession.email,
    role: req.userSession.role,
  };
}

const relatedLinkSchema = Joi.object({
  label: Joi.string().required(),
  href: Joi.string().required(),
});

const articleBodySchema = Joi.object({
  id: Joi.string().allow(null, "").optional(),
  kind: Joi.string().valid("BLOG", "GUIDE").required(),
  slug: Joi.string().min(1).required(),
  title: Joi.string().min(1).required(),
  excerpt: Joi.string().allow("").required(),
  description: Joi.string().allow("").required(),
  category: Joi.string().allow("").required(),
  status: Joi.string().optional(),
  publishedLabel: Joi.string().allow(null, "").optional(),
  readingTime: Joi.string().allow(null, "").optional(),
  coverLabel: Joi.string().allow(null, "").optional(),
  keywords: Joi.array().items(Joi.string()).optional(),
  content: Joi.array().items(Joi.string()).optional(),
  relatedLinks: Joi.array().items(relatedLinkSchema).optional(),
  seoTitle: Joi.string().allow(null, "").optional(),
  seoDescription: Joi.string().allow(null, "").optional(),
  scheduledAt: Joi.string().allow(null, "").optional(),
  sortOrder: Joi.number().integer().optional(),
  version: Joi.number().integer().min(1).optional(),
  featuredAssetId: Joi.string().allow(null, "").optional(),
  note: Joi.string().allow(null, "").optional(),
});

const productBodySchema = Joi.object({
  id: Joi.string().allow(null, "").optional(),
  slug: Joi.string().min(1).required(),
  path: Joi.string().min(1).required(),
  title: Joi.string().min(1).required(),
  description: Joi.string().allow("").required(),
  status: Joi.string().optional(),
  category: Joi.string().allow(null, "").optional(),
  heroLabel: Joi.string().allow(null, "").optional(),
  summary: Joi.string().allow(null, "").optional(),
  features: Joi.array().items(Joi.string()).optional(),
  benefits: Joi.array().items(Joi.string()).optional(),
  modules: Joi.array().items(Joi.string()).optional(),
  ctaPrimaryLabel: Joi.string().allow(null, "").optional(),
  ctaPrimaryHref: Joi.string().allow(null, "").optional(),
  ctaSecondaryLabel: Joi.string().allow(null, "").optional(),
  ctaSecondaryHref: Joi.string().allow(null, "").optional(),
  seoTitle: Joi.string().allow(null, "").optional(),
  seoDescription: Joi.string().allow(null, "").optional(),
  structuredDataJson: Joi.string().allow(null, "").optional(),
  scheduledAt: Joi.string().allow(null, "").optional(),
  sortOrder: Joi.number().integer().optional(),
  version: Joi.number().integer().min(1).optional(),
  featuredAssetId: Joi.string().allow(null, "").optional(),
  note: Joi.string().allow(null, "").optional(),
});

const pageSectionSchema = Joi.object({
  heading: Joi.string().required(),
  body: Joi.array().items(Joi.string()).required(),
  bullets: Joi.array().items(Joi.string()).optional(),
});

const pageBodySchema = Joi.object({
  id: Joi.string().allow(null, "").optional(),
  slug: Joi.string().min(1).required(),
  path: Joi.string().min(1).required(),
  title: Joi.string().min(1).required(),
  summary: Joi.string().allow(null, "").optional(),
  template: Joi.string().allow(null, "").optional(),
  body: Joi.array().items(Joi.string()).optional(),
  sections: Joi.array().items(pageSectionSchema).optional(),
  seoTitle: Joi.string().allow(null, "").optional(),
  seoDescription: Joi.string().allow(null, "").optional(),
  status: Joi.string().optional(),
  scheduledAt: Joi.string().allow(null, "").optional(),
  sortOrder: Joi.number().integer().optional(),
  version: Joi.number().integer().min(1).optional(),
  featuredAssetId: Joi.string().allow(null, "").optional(),
  note: Joi.string().allow(null, "").optional(),
});

const menuItemSchema = Joi.object({
  label: Joi.string().required(),
  href: Joi.string().required(),
  note: Joi.string().allow(null, "").optional(),
  style: Joi.string().allow(null, "").optional(),
  orderIndex: Joi.number().integer().optional(),
  isPrimary: Joi.boolean().optional(),
  openInNewTab: Joi.boolean().optional(),
  isVisible: Joi.boolean().optional(),
});

const menuBodySchema = Joi.object({
  key: Joi.string().required(),
  label: Joi.string().required(),
  location: Joi.string().valid("HEADER", "FOOTER", "header", "footer").required(),
  description: Joi.string().allow(null, "").optional(),
  isActive: Joi.boolean().optional(),
  items: Joi.array().items(menuItemSchema).optional(),
});

const settingsBodySchema = Joi.alternatives().try(
  Joi.object({
    key: Joi.string().required(),
    valueJson: Joi.string().allow(null, "").optional(),
    note: Joi.string().allow(null, "").optional(),
  }),
  Joi.object({
    settings: Joi.array()
      .items(
        Joi.object({
          key: Joi.string().required(),
          valueJson: Joi.string().allow(null, "").optional(),
          note: Joi.string().allow(null, "").optional(),
        }),
      )
      .min(1)
      .required(),
  }),
);

const redirectBodySchema = Joi.object({
  id: Joi.string().allow(null, "").optional(),
  sourcePath: Joi.string().required(),
  destinationPath: Joi.string().required(),
  statusCode: Joi.number().integer().optional(),
  isActive: Joi.boolean().optional(),
  note: Joi.string().allow(null, "").optional(),
});

const assetBodySchema = Joi.object({
  id: Joi.string().allow(null, "").optional(),
  kind: Joi.string().valid("IMAGE", "FILE", "VIDEO").optional(),
  title: Joi.string().required(),
  sourceUrl: Joi.string().required(),
  altText: Joi.string().allow(null, "").optional(),
  storageBucket: Joi.string().allow(null, "").optional(),
  storagePath: Joi.string().allow(null, "").optional(),
  mimeType: Joi.string().allow(null, "").optional(),
  sizeBytes: Joi.number().integer().allow(null).optional(),
  width: Joi.number().integer().allow(null).optional(),
  height: Joi.number().integer().allow(null).optional(),
  checksum: Joi.string().allow(null, "").optional(),
  metadataJson: Joi.string().allow(null, "").optional(),
});

const workflowBodySchema = Joi.object({
  entityType: Joi.string().required(),
  entityId: Joi.string().required(),
  action: Joi.string()
    .valid(
      "submit_review",
      "request_changes",
      "approve",
      "schedule",
      "publish",
      "cancel_schedule",
      "unpublish",
      "archive",
    )
    .required(),
  note: Joi.string().allow(null, "").optional(),
  version: Joi.number().integer().min(0).required(),
  scheduledAt: Joi.string().allow(null, "").optional(),
});

const restoreBodySchema = Joi.object({
  entityType: Joi.string().required(),
  entityId: Joi.string().required(),
  version: Joi.number().integer().min(1).required(),
});

const previewBodySchema = Joi.object({
  entityType: Joi.string().min(1).max(120).required(),
  entityId: Joi.string().min(1).max(120).required(),
  revisionVersion: Joi.number().integer().positive().required(),
  targetPath: Joi.string().min(1).max(500).required(),
  note: Joi.string().max(500).allow(null, "").optional(),
  expiresInHours: Joi.number().integer().min(1).max(720).optional(),
});

function requireCron(req: Request): void {
  const env = loadEnv();
  const expected = env.CRON_SECRET;
  if (!expected) {
    throw new AppError(503, "CRON_SECRET not configured", "CRON_NOT_CONFIGURED");
  }
  const token = req.header("x-cron-token");
  if (!token || token !== expected) {
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  }
}

export const CmsAdminController = {
  async listArticles(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const kind =
        req.query.kind === "BLOG" || req.query.kind === "GUIDE"
          ? req.query.kind
          : undefined;
      const articles = await CmsContentService.listArticles(kind);
      res.json({ ok: true, articles });
    } catch (error) {
      next(error);
    }
  },

  async getArticle(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const article = await CmsContentService.getArticle(String(req.params.id));
      res.json({ ok: true, article });
    } catch (error) {
      next(error);
    }
  },

  async upsertArticle(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.edit");
      const body = validateOrThrow(articleBodySchema, req.body);
      const article = await CmsContentService.upsertArticle(
        {
          ...body,
          id: body.id || null,
          publishedLabel: body.publishedLabel || null,
          readingTime: body.readingTime || null,
          coverLabel: body.coverLabel || null,
          seoTitle: body.seoTitle || null,
          seoDescription: body.seoDescription || null,
          scheduledAt: body.scheduledAt || null,
          featuredAssetId: body.featuredAssetId || null,
          note: body.note || null,
        },
        actor,
      );
      res.json({ ok: true, article });
    } catch (error) {
      next(error);
    }
  },

  async deleteArticle(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.delete");
      const result = await CmsContentService.deleteArticle(String(req.params.id), actor);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const products = await CmsContentService.listProducts();
      res.json({ ok: true, products });
    } catch (error) {
      next(error);
    }
  },

  async getProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const product = await CmsContentService.getProduct(String(req.params.id));
      res.json({ ok: true, product });
    } catch (error) {
      next(error);
    }
  },

  async upsertProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.edit");
      const body = validateOrThrow(productBodySchema, req.body);
      const product = await CmsContentService.upsertProduct(
        {
          ...body,
          id: body.id || null,
          category: body.category || null,
          heroLabel: body.heroLabel || null,
          summary: body.summary || null,
          seoTitle: body.seoTitle || null,
          seoDescription: body.seoDescription || null,
          structuredDataJson: body.structuredDataJson || null,
          scheduledAt: body.scheduledAt || null,
          featuredAssetId: body.featuredAssetId || null,
          note: body.note || null,
          ctaPrimaryLabel: body.ctaPrimaryLabel || null,
          ctaPrimaryHref: body.ctaPrimaryHref || null,
          ctaSecondaryLabel: body.ctaSecondaryLabel || null,
          ctaSecondaryHref: body.ctaSecondaryHref || null,
        },
        actor,
      );
      res.json({ ok: true, product });
    } catch (error) {
      next(error);
    }
  },

  async deleteProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.delete");
      const result = await CmsContentService.deleteProduct(String(req.params.id), actor);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listPages(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const pages = await CmsContentService.listPages();
      res.json({ ok: true, pages });
    } catch (error) {
      next(error);
    }
  },

  async getPage(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const page = await CmsContentService.getPage(String(req.params.id));
      res.json({ ok: true, page });
    } catch (error) {
      next(error);
    }
  },

  async upsertPage(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.edit");
      const body = validateOrThrow(pageBodySchema, req.body);
      const page = await CmsContentService.upsertPage(
        {
          ...body,
          id: body.id || null,
          summary: body.summary || null,
          template: body.template || null,
          seoTitle: body.seoTitle || null,
          seoDescription: body.seoDescription || null,
          scheduledAt: body.scheduledAt || null,
          featuredAssetId: body.featuredAssetId || null,
          note: body.note || null,
        },
        actor,
      );
      res.json({ ok: true, page });
    } catch (error) {
      next(error);
    }
  },

  async deletePage(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.delete");
      const result = await CmsContentService.deletePage(String(req.params.id), actor);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getMenu(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const menu = await CmsOpsService.getMenu(String(req.params.key));
      res.json({ ok: true, menu });
    } catch (error) {
      next(error);
    }
  },

  async upsertMenu(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.navigation.edit");
      const body = validateOrThrow(menuBodySchema, req.body);
      const menu = await CmsOpsService.upsertMenu(
        {
          ...body,
          location: String(body.location).toUpperCase(),
          description: body.description || null,
        },
        actor,
      );
      res.json({ ok: true, menu });
    } catch (error) {
      next(error);
    }
  },

  async listSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const settings = await CmsOpsService.listSettings();
      res.json({ ok: true, settings });
    } catch (error) {
      next(error);
    }
  },

  async upsertSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.settings.edit");
      const body = validateOrThrow(settingsBodySchema, req.body);
      const result = await CmsOpsService.upsertSettings(body, actor);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listRedirects(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.read");
      const redirects = await CmsOpsService.listRedirects();
      res.json({ ok: true, redirects });
    } catch (error) {
      next(error);
    }
  },

  async upsertRedirect(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.redirects.manage");
      const body = validateOrThrow(redirectBodySchema, req.body);
      const redirect = await CmsOpsService.upsertRedirect(
        {
          ...body,
          id: body.id || null,
          note: body.note || null,
        },
        actor,
      );
      res.json({ ok: true, redirect });
    } catch (error) {
      next(error);
    }
  },

  async deleteRedirect(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.redirects.manage");
      const result = await CmsOpsService.deleteRedirect(String(req.params.id), actor);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listAssets(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.media.read");
      const assets = await CmsOpsService.listAssets();
      res.json({ ok: true, assets });
    } catch (error) {
      next(error);
    }
  },

  async upsertAsset(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.media.upload");
      const body = validateOrThrow(assetBodySchema, req.body);
      const asset = await CmsOpsService.upsertAsset(
        {
          ...body,
          id: body.id || null,
          altText: body.altText || null,
          storageBucket: body.storageBucket || null,
          storagePath: body.storagePath || null,
          mimeType: body.mimeType || null,
          checksum: body.checksum || null,
          metadataJson: body.metadataJson || null,
        },
        actor,
      );
      res.json({ ok: true, asset });
    } catch (error) {
      next(error);
    }
  },

  async deleteAsset(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.media.delete");
      const result = await CmsOpsService.deleteAsset(String(req.params.id), actor);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async transition(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      const body = validateOrThrow(workflowBodySchema, req.body);
      await requireCmsPermission(
        actor.userId,
        getCmsWorkflowActionPermission(body.action as CmsWorkflowActionName),
      );
      const result = await CmsContentService.transitionWorkflow(
        {
          entityType: body.entityType,
          entityId: body.entityId,
          action: body.action as CmsWorkflowActionName,
          note: body.note || null,
          version: body.version,
          scheduledAt: body.scheduledAt || null,
        },
        actor,
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listRevisions(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.revisions.read");
      const entityType = String(req.query.entityType ?? "");
      const entityId = String(req.query.entityId ?? "");
      if (!entityType || !entityId) {
        throw new AppError(400, "entityType and entityId are required", "VALIDATION_ERROR");
      }
      const revisions = await CmsContentService.listRevisions(entityType, entityId);
      res.json({ ok: true, revisions });
    } catch (error) {
      next(error);
    }
  },

  async restoreRevision(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.restore");
      const body = validateOrThrow(restoreBodySchema, req.body);
      const result = await CmsContentService.restoreRevision(body, actor);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async createPreviewLink(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.preview.create");
      const body = validateOrThrow(previewBodySchema, req.body);
      const result = await CmsPreviewService.createPreviewLink(
        {
          ...body,
          note: body.note || null,
        },
        actor,
      );
      res.json({
        ok: true,
        previewUrl: result.previewUrl,
        tokenId: result.tokenId,
        tokenHash: result.tokenHash,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  },

  async revokePreviewLink(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = actorFrom(req);
      await requireCmsPermission(actor.userId, "cms.preview.revoke");
      const result = await CmsPreviewService.revokePreviewLink(
        String(req.params.tokenHash),
        actor,
      );
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  async processSchedules(req: Request, res: Response, next: NextFunction) {
    try {
      requireCron(req);
      const result = await CmsSchedulerService.processScheduled();
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  },
};
