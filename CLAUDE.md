# BookCinéDZ (sahla-cin)

Cinema ticket booking for Algeria. Moviegoers browse films by city, pick seats,
pay (simulation for now) and get a QR ticket; counter agents scan tickets;
contributors enter a cinema's programme; the admin publishes it. Hosted on
Railway (one web service + one PostgreSQL). See `README.md` for deployment and
day-to-day use, `AGENTS.md` for the short rules (repeated below).

@AGENTS.md

## Commands

| Task                         | Command                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| Install                      | `bun install`                                                        |
| Dev server                   | `bun run dev` (needs `DATABASE_URL`; see `.env.example`)             |
| All checks (before any push) | `bun run typecheck && bun run lint && bun run test && bun run build` |
| One test file                | `bun run test tests/booking.test.ts`                                 |
| Format                       | `bunx prettier --write <files>`                                      |
| New migration                | edit `src/server/db/schema.ts`, then `bun run db:generate`           |
| Demo data (local DB)         | `bun run db:seed`                                                    |

Tests use PGlite (Postgres in memory): no database or network needed. The TMDB
and email code take a `fetch` parameter so tests never call the internet.

## Architecture

- **TanStack Start** (React 19, SSR, file routes in `src/routes/`), Nitro
  `node-server` output started with `node .output/server/index.mjs`.
- **Server-only code** in `src/server/`: `db/` (Drizzle schema, client,
  in-process migrations with an advisory lock), `auth.ts` (Better Auth),
  `config.ts` (all env access goes through `envValue`), `services/` (business
  rules, plain functions taking `db` first so tests can call them directly).
- **`src/lib/api.ts`** is the only bridge: `createServerFn` + zod validator +
  `withViewer` / `requireUser` / `requireRole` middleware (`src/lib/middleware.ts`).
- **Errors**: throw `AppError(code, frenchMessage)`. `src/start.ts` sends it as
  `[CODE] message`; the client translates `CODE` via `t.errors` (all three
  languages). Any other error becomes a generic message — never leak details.
- **Security headers** and media `nosniff`/sandbox in `src/server.ts` and
  `src/routes/api/media/$id.ts`. Images are checked by magic bytes and stored in
  Postgres (`media` table), max 3 MB.
- **Health page** `/api/health` reports configuration without secrets; add a
  line there when a new env variable matters.

## Business rules worth knowing

- Times are Africa/Algiers (UTC+1, no DST). Use `parseAlgiersLocal` and format
  with `timeZone: "Africa/Algiers"`, `hour12: false`.
- A seat is sold once: `UNIQUE (screening_id, seat_id)` in `booking_seats`.
  Pending holds expire (`releaseExpiredHolds`).
- Screenings cannot overlap in a hall (film length + 15 min cleaning), checked
  under a row lock on the hall.
- Contributors and counter agents only act on cinemas they are attached to
  (`assertManagesCinema`). Admins come from verified `ADMIN_EMAILS` or the
  `user_roles` table.
- Payments: `PAYMENT_MODE=simulation` only. A real provider (CIB/Edahabia via
  SATIM or Chargily) is still to be wired; do not mark bookings paid elsewhere.

## Languages (FR / AR / EN)

- All UI text lives in `src/lib/i18n/fr.ts` (the master `Dict` type), `ar.ts`,
  `en.ts`. Add every new key to all three; TypeScript fails otherwise. Arabic
  needs real plural forms (0, 1, 2, 3–10, 11+) for counts.
- Arabic is right-to-left: use logical Tailwind classes (`ms-`, `me-`, `ps-`,
  `start-`, `text-start`), never `ml-`/`left-`. Seat maps stay `dir="ltr"`.
- Film titles: `useI18n().title(movie)` and `.subtitle(movie)` implement the
  display rule (localized title, original title underneath only when useful).
- Comments and user-facing server messages in the codebase are in French; keep
  that style.

## Working conventions

- Never edit an applied migration in `drizzle/`; generate a new one.
- Every rule change gets a test in `tests/`.
- Keep pages free of `src/server/` imports (the build fails otherwise).
- Every push to `main` deploys to production on Railway, so run the full
  checks first and keep `main` green (CI: `.github/workflows/ci.yml`).
- Never commit secrets; `.env*` is ignored except `.env.example`.
