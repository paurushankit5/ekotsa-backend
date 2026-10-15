# Database migrations (ekotsa-backend)

Laravel-style: one file per change, ledger of what already ran, auto-discovery.

## Commands

```bash
npm run db:migrate:status
npm run db:migrate
```

## How it works

1. Every file matching `src/db/migrations/<timestamp>_<name>.ts` is loaded automatically.
2. Files are sorted **ascending** by timestamp (`…000` then `…001` then `…002`).
3. Applied ids live in Postgres `schema_migrations`.
4. Re-running migrate skips anything already recorded.

No manual index. Drop a new file in the folder; the runner picks it up.

## Preferred style: Sequelize `queryInterface`

Do **not** write raw SQL for normal column/table changes. Use helpers:

```ts
import type { Migration } from "./types.js";
import {
  DataTypes,
  addColumnIfNotExists,
  removeColumnIfExists,
} from "./helpers.js";

const migration: Migration = {
  id: "202604080002_add_foo_column",
  async up({ queryInterface }) {
    await addColumnIfNotExists(queryInterface, "some_table", "foo", {
      type: DataTypes.STRING,
      allowNull: true,
    });
  },
  async down({ queryInterface }) {
    await removeColumnIfExists(queryInterface, "some_table", "foo");
  },
};

export default migration;
```

Copy-paste starter: [`_templates/add_column.ts`](./migrations/_templates/add_column.ts)

Also available directly on `queryInterface`: `createTable`, `dropTable`, `addIndex`, `removeIndex`, `renameColumn`, etc.

Use raw SQL only for Postgres-specific edge cases (complex constraints, data backfills).

## Adding a change

```bash
npm run db:migration:create -- add_foo_column
```

Name must be **snake_case** only (no spaces, hyphens, or camelCase).
Edit the file, then:

```bash
npm run db:migrate
```

Manual option: copy [`migrations/_templates/add_column.ts`](./migrations/_templates/add_column.ts).
Filename stem **must** equal `migration.id`.

## Baseline

`202604070000_baseline_schema` bootstraps tables for a **new** empty database from current Sequelize models (`sync` without `alter`). Later migrations own incremental changes.

## Do not use `db:sync` for normal work

`npm run db:sync` is legacy/bootstrap only. Day-to-day schema = migration files + `db:migrate`.
