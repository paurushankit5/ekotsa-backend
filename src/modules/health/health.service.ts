import { sequelize } from "../../db/models/index.js";

export const HealthService = {
  async check() {
    const started = Date.now();
    await sequelize.authenticate();
    return {
      status: "ok" as const,
      database: "up" as const,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    };
  },
};
