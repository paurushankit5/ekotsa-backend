import { Router } from "express";
import { healthRouter } from "../../modules/health/health.routes.js";
import { userRouter } from "../../modules/users/user.routes.js";

export const v1Router = Router();

v1Router.use("/health", healthRouter);
v1Router.use("/users", userRouter);
