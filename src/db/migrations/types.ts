import type { QueryInterface, Sequelize } from "sequelize";

export type MigrationContext = {
  sequelize: Sequelize;
  queryInterface: QueryInterface;
};

export type Migration = {
  /** Unique id recorded in schema_migrations after success. Never rename after apply. */
  id: string;
  up: (ctx: MigrationContext) => Promise<void>;
  down?: (ctx: MigrationContext) => Promise<void>;
};
