import { Sequelize } from "sequelize";
import { loadEnv } from "../config/env.js";

declare global {
  // eslint-disable-next-line no-var
  var __ekotsaSequelize: Sequelize | undefined;
}

function createSequelize(): Sequelize {
  const env = loadEnv();

  return new Sequelize(env.DATABASE_URL, {
    dialect: "postgres",
    logging: env.NODE_ENV === "development" ? console.log : false,
  });
}

export const sequelize = globalThis.__ekotsaSequelize ?? createSequelize();

if (process.env.NODE_ENV !== "production") {
  globalThis.__ekotsaSequelize = sequelize;
}
