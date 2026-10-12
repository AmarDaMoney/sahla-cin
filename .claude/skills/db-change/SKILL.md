---
name: db-change
description: Change the database (new table, column, index or constraint) safely with Drizzle migrations. Use whenever src/server/db/schema.ts needs editing.
---

# Database change

1. Edit `src/server/db/schema.ts`. App tables use snake_case column keys;
   Better Auth tables (`user`, `session`, `account`, `verification`,
   `rateLimit`) keep camelCase — do not rename them.
2. `bun run db:generate` creates `drizzle/NNNN_<name>.sql`. Rename the file
   and its `tag` in `drizzle/meta/_journal.json` to something descriptive if
   you like, consistently.
3. Read the generated SQL. Adding a NOT NULL column to an existing table needs
   a default (production has data). Never edit an already-applied migration.
4. Migrations run automatically at server start (`src/server/db/migrate.ts`,
   advisory lock), so a deploy applies them; nothing to run on Railway.
5. Update the services, the zod validators in `src/lib/api.ts`, the demo data
   (`src/server/services/demo.ts`) if relevant, and add tests in `tests/`.
6. Run the `verify` skill.
