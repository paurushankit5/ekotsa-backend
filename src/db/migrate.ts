import "dotenv/config";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { QueryTypes } from "sequelize";
import { sequelize } from "./sequelize.js";
import type { Migration } from "./migrations/types.js";

const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";
/** Always run via `npm run db:migrate` from the package root (tsx on src/). */
const MIGRATIONS_DIR = path.join(process.cwd(), "src/db/migrations");

/** Files like 202604070001_add_registration_lead_fields.ts */
const MIGRATION_FILE_RE = /^(\d+_[a-z0-9_]+)\.(ts|js)$/i;

async function ensureMigrationsTable() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      id VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function appliedIds(): Promise<Set<string>> {
  const rows = await sequelize.query<{ id: string }>(
    `SELECT id FROM ${SCHEMA_MIGRATIONS_TABLE} ORDER BY id ASC`,
    { type: QueryTypes.SELECT },
  );
  return new Set(rows.map((row) => row.id));
}

async function recordApplied(id: string) {
  await sequelize.query(
    `INSERT INTO ${SCHEMA_MIGRATIONS_TABLE} (id, applied_at) VALUES (:id, NOW())`,
    { replacements: { id } },
  );
}

/**
 * Auto-discover migration files. No manual index registry.
 * Sorted ascending by filename timestamp so older migrations always run first
 * (everything before a newer change is already applied).
 */
async function loadMigrations(): Promise<Migration[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries
    .map((name) => {
      const match = name.match(MIGRATION_FILE_RE);
      if (!match) return null;
      return { name, id: match[1] };
    })
    .filter((value): value is { name: string; id: string } => Boolean(value))
    .sort((a, b) => a.id.localeCompare(b.id));

  const migrations: Migration[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    if (seen.has(file.id)) {
      throw new Error(`Duplicate migration id from filename: ${file.id}`);
    }
    seen.add(file.id);

    const mod = (await import(pathToFileURL(path.join(MIGRATIONS_DIR, file.name)).href)) as {
      default?: Migration;
    };
    const migration = mod.default;
    if (!migration || typeof migration.up !== "function" || !migration.id) {
      throw new Error(`Migration ${file.name} must default-export { id, up }`);
    }
    if (migration.id !== file.id) {
      throw new Error(
        `Migration id mismatch: file "${file.name}" exports id "${migration.id}" (expected "${file.id}")`,
      );
    }
    migrations.push(migration);
  }

  return migrations;
}

async function status() {
  await ensureMigrationsTable();
  const applied = await appliedIds();
  const migrations = await loadMigrations();
  const todo = migrations.filter((m) => !applied.has(m.id));

  console.log("[ekotsa-backend] migration status");
  for (const migration of migrations) {
    const mark = applied.has(migration.id) ? "applied" : "pending";
    console.log(`  [${mark}] ${migration.id}`);
  }
  console.log(`[ekotsa-backend] ${todo.length} pending, ${applied.size} applied (${migrations.length} files)`);
}

async function migrate() {
  await ensureMigrationsTable();
  const applied = await appliedIds();
  const migrations = await loadMigrations();
  const todo = migrations.filter((m) => !applied.has(m.id));

  if (todo.length === 0) {
    console.log("[ekotsa-backend] migrations: nothing to run");
    return;
  }

  console.log(`[ekotsa-backend] migrations: running ${todo.length} pending`);
  for (const migration of todo) {
    console.log(`  -> ${migration.id}`);
    try {
      await migration.up({
        sequelize,
        queryInterface: sequelize.getQueryInterface(),
      });
      await recordApplied(migration.id);
      console.log(`  ok ${migration.id}`);
    } catch (error) {
      console.error(`  failed ${migration.id}`);
      throw error;
    }
  }
  console.log("[ekotsa-backend] migrations: complete");
}

async function main() {
  const command = process.argv[2] ?? "up";
  try {
    if (command === "status") {
      await status();
    } else if (command === "up") {
      await migrate();
    } else {
      console.error(`Unknown command "${command}". Use: up | status`);
      process.exitCode = 1;
    }
  } finally {
    await sequelize.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[ekotsa-backend] migration failed", error);
  process.exit(1);
});
