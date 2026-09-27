import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { UserService } from "./user.service.js";

const createUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().trim().min(1).max(120).optional(),
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
      const body = createUserSchema.parse(req.body);
      const user = await UserService.createUser(body);
      res.status(201).json({ ok: true, data: { user } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues.map((issue) => issue.message).join("; "),
          },
        });
        return;
      }
      next(error);
    }
  },
};
