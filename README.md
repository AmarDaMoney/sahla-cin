# BookCinéDZ (sahla-cin)

Cinema ticket booking for Algeria: movie listings by city, seat selection,
payment (online or at the counter), QR tickets, and a scanner for counter
agents. Cinemas submit their programmes; an admin reviews and publishes them.

Everything runs on **Railway**: one web service (this app) and one PostgreSQL
database. Emails go through **Resend**.

| Layer                | Tool                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| App (pages + server) | TanStack Start (React 19, SSR), Tailwind 4, shadcn/ui                                |
| Database             | PostgreSQL + Drizzle ORM (typed schema in `src/server/db/schema.ts`)                 |
| Accounts             | Better Auth: email + password with verified address, password reset, optional Google |
| Tests                | Vitest + PGlite (real Postgres in memory, no setup needed)                           |

## Deploy on Railway (first time, ~20 minutes)

1. **Create the project.** Railway → _New Project_ → _Deploy from GitHub repo_
   → `sahla-cin`. Then in the same project: _+ Create_ → _Database_ →
   _PostgreSQL_.
2. **Generate a public address.** App service → _Settings_ → _Networking_ →
   _Generate Domain_ (or add your own domain). Copy the URL.
3. **Set the variables.** App service → _Variables_ (see `.env.example`):

   | Variable             | Value                                                                             |
   | -------------------- | --------------------------------------------------------------------------------- |
   | `DATABASE_URL`       | `${{Postgres.DATABASE_URL}}` (Railway fills it in)                                |
   | `BETTER_AUTH_URL`    | the URL from step 2, e.g. `https://bookcine.up.railway.app`                       |
   | `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` (keep it secret)                              |
   | `ADMIN_EMAILS`       | your email address                                                                |
   | `RESEND_API_KEY`     | from [resend.com](https://resend.com) (free tier is enough to start)              |
   | `EMAIL_FROM`         | e.g. `BookCinéDZ <billets@your-domain.dz>`; the domain must be verified in Resend |
   | `PAYMENT_MODE`       | `simulation` for now (see _Payments_ below)                                       |

   Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Google sign-in),
   `VITE_WHATSAPP_NUMBER` (support link). Changing a `VITE_*` variable needs a
   redeploy.

4. **Check.** Open `https://<your-address>/api/health`: every line should say
   `ok` (it never shows secret values).
5. **Deploy.** Railway builds with `railway.json`; on every start the database
   migrations run first (`scripts/migrate.mjs`), then the server.
6. **Become admin.** Sign up in the app with the address in `ADMIN_EMAILS` and
   click the confirmation link. You now see _Espace admin_ in _Compte_.

Every push to `main` redeploys automatically.

## Languages

French, Arabic (right-to-left) and English, chosen with the language button in
the header (remembered in a cookie; first visit follows the browser). All
texts live in `src/lib/i18n/{fr,ar,en}.ts` — TypeScript and the tests make sure
every language has every key. Films have a title and synopsis per language;
when a translation is missing the French one is shown. Emails go out in the
language the person was using.

## Day-to-day (admin page)

- **Lieux**: add cities, cinemas (paste GPS coordinates from Google Maps) and
  screens; the seat map (rows of 10) is created automatically.
- **Films**: add or edit films, with titles and synopses in French, Arabic
  and English. **Upload the poster** directly (it is resized in the browser and
  stored in the database, so it is backed up with everything else), or paste
  an image URL.
- **Équipe**: give a role to an existing account by email. Contributors (enter
  a cinema's programme) and counter agents (scan tickets) must be attached to
  their cinema; they only see and act on that cinema.
- **Validation**: publish the showings contributors submitted.

## Payments

Online payment is **simulated** while `PAYMENT_MODE=simulation`: the payment
is accepted instantly. Remove the variable and only "pay at the counter" is
offered. To go live, sign up with a provider (SATIM/CIB-Edahabia through your
bank, Chargily Pay, Slick Pay…), then a developer:

1. creates the checkout in `startOnlinePayment` (`src/lib/api.ts`) and returns
   `{ status: "redirect", url }`;
2. adds a webhook route that **verifies the provider's signature** and then
   calls `confirmPayment` (`src/server/services/booking.ts`), which checks the
   amount and refuses expired bookings.

## How booking stays safe

- The browser never touches the database. Every action is a server function
  (`src/lib/api.ts`) that validates its input and checks the caller's role.
- A seat can only belong to one active booking per showing: a database
  constraint (`booking_seats_screening_seat_key`) makes double-booking
  impossible, even with simultaneous clicks.
- Prices, totals and ticket codes are computed on the server. Unpaid bookings
  expire (15 min online; 15 min before the show for counter payment, max 2 per
  customer) and free their seats.
- The scanner rejects cancelled, used, unpaid, too early, finished and
  other-cinema tickets.
- Accounts: verified email required, passwords ≥ 8 characters (hashed),
  login attempts rate-limited per visitor (`/api/health` → `rateLimit` must say
  "par visiteur"), sessions in httpOnly cookies, security headers on every page.
- Uploaded images are checked by content (JPEG/PNG/WebP only, 3 MB max) and
  served with a locked-down content policy.

## Develop locally

```bash
bun install
cp .env.example .env        # point DATABASE_URL at a local Postgres
bun run db:migrate && bun run db:seed
bun run dev                 # http://localhost:8080
```

Without `RESEND_API_KEY`, emails (with their links) are printed in the
terminal.

| Command                              | What it does                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| `bun run test`                       | business-logic tests on an in-memory Postgres                      |
| `bun run typecheck` / `bun run lint` | static checks                                                      |
| `bun run db:generate`                | after editing `schema.ts`: creates the SQL migration in `drizzle/` |
| `bun run db:studio`                  | browse the database                                                |

GitHub Actions runs all checks on every push and pull request.
