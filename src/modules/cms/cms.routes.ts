import { Router } from "express";
import { requireAdminSession } from "../../middleware/requireUserSession.js";
import { CmsAdminController } from "./cms.admin.controller.js";
import { CmsPublicController } from "./cms.public.controller.js";

/**
 * Public CMS surface — mounted at /v1/cms
 */
export const cmsRouter = Router();

cmsRouter.get("/public/bootstrap", CmsPublicController.bootstrap);
cmsRouter.get("/public/blog", CmsPublicController.listBlog);
cmsRouter.get("/public/blog/:slug", CmsPublicController.getBlog);
cmsRouter.get("/public/guides", CmsPublicController.listGuides);
cmsRouter.get("/public/guides/:slug", CmsPublicController.getGuide);
cmsRouter.get("/public/products", CmsPublicController.listProducts);
cmsRouter.get("/public/products/:slug", CmsPublicController.getProduct);
cmsRouter.get("/public/pages", CmsPublicController.getPage);
cmsRouter.get("/public/preview/:token", CmsPublicController.preview);

cmsRouter.get("/_status", (_req, res) => {
  res.json({
    ok: true,
    domain: "cms",
    status: "live",
  });
});

/**
 * Admin CMS surface — mounted at /v1/admin/cms
 */
export const cmsAdminRouter = Router();

cmsAdminRouter.get("/articles", requireAdminSession, CmsAdminController.listArticles);
cmsAdminRouter.get("/articles/:id", requireAdminSession, CmsAdminController.getArticle);
cmsAdminRouter.put("/articles", requireAdminSession, CmsAdminController.upsertArticle);
cmsAdminRouter.delete("/articles/:id", requireAdminSession, CmsAdminController.deleteArticle);

cmsAdminRouter.get("/products", requireAdminSession, CmsAdminController.listProducts);
cmsAdminRouter.get("/products/:id", requireAdminSession, CmsAdminController.getProduct);
cmsAdminRouter.put("/products", requireAdminSession, CmsAdminController.upsertProduct);
cmsAdminRouter.delete("/products/:id", requireAdminSession, CmsAdminController.deleteProduct);

cmsAdminRouter.get("/pages", requireAdminSession, CmsAdminController.listPages);
cmsAdminRouter.get("/pages/:id", requireAdminSession, CmsAdminController.getPage);
cmsAdminRouter.put("/pages", requireAdminSession, CmsAdminController.upsertPage);
cmsAdminRouter.delete("/pages/:id", requireAdminSession, CmsAdminController.deletePage);

cmsAdminRouter.get("/menus/:key", requireAdminSession, CmsAdminController.getMenu);
cmsAdminRouter.put("/menus", requireAdminSession, CmsAdminController.upsertMenu);

cmsAdminRouter.get("/settings", requireAdminSession, CmsAdminController.listSettings);
cmsAdminRouter.put("/settings", requireAdminSession, CmsAdminController.upsertSettings);

cmsAdminRouter.get("/redirects", requireAdminSession, CmsAdminController.listRedirects);
cmsAdminRouter.put("/redirects", requireAdminSession, CmsAdminController.upsertRedirect);
cmsAdminRouter.delete("/redirects/:id", requireAdminSession, CmsAdminController.deleteRedirect);

cmsAdminRouter.get("/assets", requireAdminSession, CmsAdminController.listAssets);
cmsAdminRouter.put("/assets", requireAdminSession, CmsAdminController.upsertAsset);
cmsAdminRouter.delete("/assets/:id", requireAdminSession, CmsAdminController.deleteAsset);

cmsAdminRouter.post(
  "/workflow/transition",
  requireAdminSession,
  CmsAdminController.transition,
);
cmsAdminRouter.get("/revisions", requireAdminSession, CmsAdminController.listRevisions);
cmsAdminRouter.post(
  "/revisions/restore",
  requireAdminSession,
  CmsAdminController.restoreRevision,
);

cmsAdminRouter.post(
  "/preview-links",
  requireAdminSession,
  CmsAdminController.createPreviewLink,
);
cmsAdminRouter.delete(
  "/preview-links/:tokenHash",
  requireAdminSession,
  CmsAdminController.revokePreviewLink,
);

/**
 * Internal cron — mounted at /v1/internal/cms
 */
export const cmsInternalRouter = Router();
cmsInternalRouter.post("/process-schedules", CmsAdminController.processSchedules);
