import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { Env } from "./config/env.js";
import { getCorsOrigins } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { v1Router } from "./routes/v1/index.js";

export function createApp(env: Env) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(
    cors({
      origin: getCorsOrigins(env),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  morgan.token("safe-url", (req) => {
    try {
      const request = req as { originalUrl?: string; url?: string };
      return new URL(request.originalUrl || request.url || "/", "http://localhost").pathname;
    } catch {
      return "[invalid-url]";
    }
  });
  app.use(morgan(
    env.NODE_ENV === "production"
      ? ':remote-addr - :remote-user [:date[iso]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
      : ':method :safe-url :status :response-time ms',
  ));

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "ekotsa-backend",
      version: "0.1.0",
    });
  });

  app.use("/v1", v1Router);
  // Atithi calls /api/v1/* today
  app.use("/api/v1", v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
