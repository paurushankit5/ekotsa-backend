import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../middleware/errorHandler.js";
import { CmsPublicService } from "./cms.public.service.js";

export const CmsPublicController = {
  async bootstrap(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await CmsPublicService.bootstrap();
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async listBlog(_req: Request, res: Response, next: NextFunction) {
    try {
      const articles = await CmsPublicService.listBlog();
      res.json({ ok: true, articles });
    } catch (error) {
      next(error);
    }
  },

  async getBlog(req: Request, res: Response, next: NextFunction) {
    try {
      const article = await CmsPublicService.getBlog(String(req.params.slug));
      if (!article) throw new AppError(404, "Article not found", "NOT_FOUND");
      res.json({ ok: true, article });
    } catch (error) {
      next(error);
    }
  },

  async listGuides(_req: Request, res: Response, next: NextFunction) {
    try {
      const articles = await CmsPublicService.listGuides();
      res.json({ ok: true, articles });
    } catch (error) {
      next(error);
    }
  },

  async getGuide(req: Request, res: Response, next: NextFunction) {
    try {
      const article = await CmsPublicService.getGuide(String(req.params.slug));
      if (!article) throw new AppError(404, "Guide not found", "NOT_FOUND");
      res.json({ ok: true, article });
    } catch (error) {
      next(error);
    }
  },

  async listProducts(_req: Request, res: Response, next: NextFunction) {
    try {
      const products = await CmsPublicService.listProducts();
      res.json({ ok: true, products });
    } catch (error) {
      next(error);
    }
  },

  async getProduct(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await CmsPublicService.getProduct(String(req.params.slug));
      if (!product) throw new AppError(404, "Product not found", "NOT_FOUND");
      res.json({ ok: true, product });
    } catch (error) {
      next(error);
    }
  },

  async getPage(req: Request, res: Response, next: NextFunction) {
    try {
      const path = String(req.query.path ?? "");
      if (!path) throw new AppError(400, "path query is required", "VALIDATION_ERROR");
      const page = await CmsPublicService.getPageByPath(path);
      if (!page) throw new AppError(404, "Page not found", "NOT_FOUND");
      res.json({ ok: true, page });
    } catch (error) {
      next(error);
    }
  },

  async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const payload = await CmsPublicService.resolvePreview(String(req.params.token));
      res.json({ ok: true, ...payload });
    } catch (error) {
      next(error);
    }
  },
};
