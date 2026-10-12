# Notes for coding agents

- Layout: `src/server/` is server-only (database, auth, business logic in
  `services/`). `src/lib/api.ts` exposes it to pages as server functions.
  Pages never import `src/server/` directly (the build fails if they do).
- Database changes: edit `src/server/db/schema.ts`, run `bun run db:generate`,
  commit the new file in `drizzle/`. Never edit an applied migration.
- Every server function validates input with zod and uses `requireUser` /
  `requireRole` for anything private. Errors meant for users are `AppError`;
  anything else is replaced by a generic message.
- Business rules live in `src/server/services/` and are covered by `tests/`.
  Add or update tests with every rule change.
- Before pushing: `bun run typecheck && bun run lint && bun run test && bun run build`.
