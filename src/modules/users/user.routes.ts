import { Router } from "express";
import { UserController } from "./user.controller.js";

export const userRouter = Router();

userRouter.get("/", UserController.list);
userRouter.get("/:id", UserController.getById);
userRouter.post("/", UserController.create);
