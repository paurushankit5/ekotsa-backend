---
name: db-migrations
description: >-
  Enforces versioned Sequelize migrations for ekotsa-backend Postgres schema
  changes. Use whenever adding, dropping, renaming, or altering tables, columns,
  indexes, enums, or constraints; when editing Sequelize models that change the
  database shape; or when the user mentions migrations, db:migrate, schema
  changes, or ALTER TABLE. Never apply schema by hand or via db:sync.
---

# Database migrations (ekotsa-backend)

**Non-negotiable:** every table/column/index/enum/constraint change goes through a migration file + `npm run db:migrate`. Do not alter the database manually and do not use `npm run db:sync` for normal work.

## When this skill applies

- Adding / dropping / renaming tables or columns
- Changing column types, nullability, defaults, unique constraints
- Adding / dropping indexes or foreign keys
- Editing Sequelize models in `src/db/models/` in a way that implies schema change
- Deploy / env setup that needs schema updates

## Hard rules

1. **Create a migration file** with the generator — never invent ad-hoc SQL against production/dev by hand as the primary path.
2. **Name must be snake_case only** (no spaces, hyphens, camelCase).
3. Prefer **Sequelize `queryInterface` helpers** (`addColumnIfNotExists`, `removeColumnIfExists`, `createTable`, `addIndex`, …) over raw SQL.
4. **Append-only history:** never rewrite or reorder an already-applied migration id.
5. After writing the migration (and updating the model if needed), **run** `npm run db:migrate`.
6. Confirm with `npm run db:migrate:status` when useful.
7. **Do not** use `npm run db:sync` / `sequelize.sync({ alter: true })` for schema changes.

## Required workflow

```
Schema-change progress:
- [ ] Decide snake_case migration name (e.g. add_industry_to_registrations)
- [ ] npm run db:migration:create -- <snake_case_name>
- [ ] Edit the new file under src/db/migrations/ (queryInterface helpers)
- [ ] Update Sequelize model in src/db/models/ to match
- [ ] npm run db:migrate
- [ ] npm run db:migrate:status  (optional verify)
```

### Create

```bash
npm run db:migration:create -- add_foo_column
```

### Implement

Use helpers from `src/db/migrations/helpers.js`:

```ts
import type { Migration } from "./types.js";
import {
  DataTypes,
  addColumnIfNotExists,
  removeColumnIfExists,
} from "./helpers.js";

const migration: Migration = {
  id: "YYYYMMDDHHMMSS_add_foo_column", // must match filename stem
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

Template reference: `src/db/migrations/_templates/add_column.ts`  
Docs: `src/db/MIGRATIONS.md`

### Run

```bash
npm run db:migrate
npm run db:migrate:status
```

The runner auto-discovers `src/db/migrations/<timestamp>_<name>.ts`, sorts ascending, and skips ids already in `schema_migrations`.

## Anti-patterns (do not do)

- Running raw `ALTER TABLE` in psql / GUI as the delivery mechanism
- Calling `sequelize.sync({ alter: true })` or `npm run db:sync` to “just fix” columns
- Editing an already-applied migration file instead of creating a new one
- Changing only the Sequelize model and assuming the DB will catch up
- Migration names with spaces (`add foo`), hyphens (`add-foo`), or camelCase (`addFoo`)

## Model + migration together

If the feature needs a new field in code:

1. Migration first (or same PR) — DB shape
2. Model field in `src/db/models/*`
3. Service/API/validation updates

Never ship model-only schema drift.

## Done criteria

- New migration file exists and uses snake_case id
- `db:migrate` applied it (or status shows applied)
- Sequelize model matches the new schema
- No reliance on `db:sync` for the change
