import type { NextFunction, Request, Response } from "express";
import { Joi, validateOrThrow } from "../../utils/validate.js";
import { UserService } from "./user.service.js";

const createUserSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  name: Joi.string().trim().min(1).max(120).optional(),
});

export const UserController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const users = await UserService.listUsers();
      res.json({ ok: true, data: { users } });
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await UserService.getUserById(String(req.params.id));
      res.json({ ok: true, data: { user } });
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = validateOrThrow(createUserSchema, req.body);
      const user = await UserService.createUser(body);
      res.status(201).json({ ok: true, data: { user } });
    } catch (error) {
      next(error);
    }
  },
};
