#!/usr/bin/env node
/**
 * Create a new Sequelize migration file (Laravel-style make:migration).
 *
 * Name must be snake_case only: lowercase letters, digits, underscores.
 * No spaces, hyphens, or camelCase.
 *
 * Usage:
 *   npm run db:migration:create -- add_foo_column
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.join(process.cwd(), "src/db/migrations");
const MIGRATION_FILE_RE = /^(\d+_[a-z0-9_]+)\.(ts|js)$/i;

/** Strict snake_case: add_foo_column, add_notes_v2 */
const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

function validateSnakeCaseName(raw: string): string {
  const name = raw.trim();

  if (!name) {
    throw new Error("Migration name is required. Example: add_foo_column");
  }
  if (/\s/.test(name)) {
    throw new Error(
      `Invalid name "${name}": spaces are not allowed. Use snake_case, e.g. add_foo_column`,
    );
  }
  if (/-/.test(name)) {
    throw new Error(
      `Invalid name "${name}": hyphens are not allowed. Use snake_case, e.g. add_foo_column`,
    );
  }
  if (/[A-Z]/.test(name)) {
    throw new Error(
      `Invalid name "${name}": use snake_case only (no camelCase). Example: add_foo_column`,
    );
  }
  if (!SNAKE_CASE_RE.test(name)) {
    throw new Error(
      `Invalid name "${name}": must be snake_case — start with a letter, then lowercase letters, digits, and single underscores only. Example: add_foo_column`,
    );
  }
  if (name.includes("__")) {
    throw new Error(
      `Invalid name "${name}": double underscores are not allowed. Example: add_foo_column`,
    );
  }

  return name;
}

function timestampPrefix(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}${ss}`;
}

function migrationSource(id: string): string {
  return `import type { Migration } from "./types.js";
import {
  DataTypes,
  addColumnIfNotExists,
  removeColumnIfExists,
} from "./helpers.js";

/**
 * TODO: describe this schema change.
 * Prefer queryInterface helpers over raw SQL.
 */
const migration: Migration = {
  id: ${JSON.stringify(id)},
  async up({ queryInterface }) {
    await addColumnIfNotExists(queryInterface, "table_name", "column_name", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  },
  async down({ queryInterface }) {
    await removeColumnIfExists(queryInterface, "table_name", "column_name");
  },
};

export default migration;
`;
}

async function main() {
  // Single argv token after `--` — do not join spaces into a name.
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`Usage:
  npm run db:migration:create -- <snake_case_name>

Rules:
  - snake_case only (lowercase + underscores)
  - no spaces, hyphens, or camelCase

Examples:
  npm run db:migration:create -- add_foo_column
  npm run db:migration:create -- add_notes_to_organizations
`);
    process.exit(args.length === 0 ? 1 : 0);
  }
  if (args.length > 1) {
    throw new Error(
      `Expected a single snake_case name, got ${args.length} args. Use underscores, not spaces. Example: add_foo_column`,
    );
  }

  const slug = validateSnakeCaseName(args[0]!);
  await mkdir(MIGRATIONS_DIR, { recursive: true });

  let prefix = timestampPrefix();
  const existing = await readdir(MIGRATIONS_DIR);
  const used = new Set(
    existing
      .map((f) => f.match(MIGRATION_FILE_RE)?.[1])
      .filter((id): id is string => Boolean(id)),
  );

  while (used.has(`${prefix}_${slug}`) || [...used].some((id) => id.startsWith(`${prefix}_`))) {
    const asNumber = Number(prefix);
    if (!Number.isFinite(asNumber)) break;
    prefix = String(asNumber + 1);
  }

  const id = `${prefix}_${slug}`;
  const filename = `${id}.ts`;
  const fullPath = path.join(MIGRATIONS_DIR, filename);

  if (used.has(id)) {
    throw new Error(`Migration already exists: ${filename}`);
  }

  await writeFile(fullPath, migrationSource(id), { flag: "wx" });
  console.log(`[ekotsa-backend] created migration ${filename}`);
  console.log(`  path: ${fullPath}`);
  console.log(`  next: edit the file, then npm run db:migrate`);
}

main().catch((error) => {
  console.error("[ekotsa-backend] create migration failed", error instanceof Error ? error.message : error);
  process.exit(1);
});
