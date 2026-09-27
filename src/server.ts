import "dotenv/config";
import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { sequelize } from "./db/models/index.js";

async function main() {
  const env = loadEnv();
  const app = createApp(env);

  const server = app.listen(env.PORT, () => {
    console.log(`[ekotsa-backend] listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[ekotsa-backend] shutting down (${signal})`);
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
  console.error("[ekotsa-backend] failed to start", error);
  await sequelize.close().catch(() => undefined);
  process.exit(1);
});
