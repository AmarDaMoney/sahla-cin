---
name: verify
description: Run every check CI runs (typecheck, lint, tests, migration drift, build) before committing or pushing to this repo. Use before any push, since main deploys to production on Railway.
---

# Verify before pushing

Run from the repository root, in this order, and stop at the first failure:

1. `bunx prettier --write <changed files>` (CI does not reformat for you).
2. `bun run typecheck`
3. `bun run lint`
4. `bun run test` (Vitest + PGlite, ~1–2 min; no database or network needed)
5. `bunx drizzle-kit check` and `bun run db:generate`, then `git status drizzle/`:
   a new file means the schema changed without a committed migration — commit it.
6. `bun run build`

Report each step as passed or failed with the relevant output. A failure in a
file you did not touch is still reported; never skip or disable a test.
