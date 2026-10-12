# BookCinéDZ (sahla-cin)

Cinema ticket booking for Algeria: movie listings by city, seat selection,
payment (CIB / Edahabia / BaridiMob / pay at the counter), QR tickets, and a
scanner for counter agents. Cinemas submit their programmes; an admin
reviews and publishes them.

**Stack:** TanStack Start (React 19, SSR) · Tailwind 4 + shadcn/ui · Supabase
(Postgres, Auth, Storage) · Nitro (deploys to Vercel, Netlify, Cloudflare or a
plain Node server).

## Run locally

```bash
bun install
cp .env.example .env   # then fill in your Supabase values
bun run dev            # http://localhost:8080
```

Checks: `bun run typecheck`, `bun run lint`, `bun run build`.

## Set up the backend (one-time)

1. Create a project on [supabase.com](https://supabase.com). Pick the region
   closest to Algeria (e.g. Frankfurt / `eu-central-1`).
2. Apply the database schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push        # runs everything in supabase/migrations/
   ```
3. **Authentication → URL Configuration**
   - Site URL: your production URL (e.g. `https://bookcine.dz`)
   - Redirect URLs: the same URL plus `http://localhost:8080/**` for development.
     The confirmation email link sends users back to whichever of these
     addresses they signed up from.
4. **Authentication → Emails → SMTP**: plug in a real email provider
   (Resend, Brevo, Amazon SES…). Supabase's built-in sender is limited to a
   few emails per hour and is not meant for production.
5. _(Optional)_ **Authentication → Providers → Google**: add a Google OAuth
   client ID/secret to enable "Continuer avec Google".
6. **Storage**: create a public bucket named `posters` (movie posters).
7. Make yourself admin: sign up in the app, then in the SQL editor:
   ```sql
   insert into user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com';
   ```
   Counter agents need the `agent_guichet` role **and** an assignment to their
   cinema (admin page → staff), otherwise the scanner refuses their tickets.

## Deploy (Vercel example)

1. Import the GitHub repo in Vercel. Nitro detects Vercel automatically.
2. Add the environment variables from `.env.example` (Production + Preview).
   `SUPABASE_SERVICE_ROLE_KEY` is secret: never prefix it with `VITE_`.
3. Point your domain at Vercel and update the Supabase Site URL (step 3 above).

Any other host works too: `bun run build` then `node .output/server/index.mjs`,
or set `NITRO_PRESET` (`netlify`, `cloudflare-module`, `node-server`…).

## How booking and payment work

All writes to `bookings`, `booking_seats` and `tickets` go through Postgres
functions (see `supabase/migrations/20261012120000_secure_booking_flow.sql`);
the browser cannot set prices, statuses or QR codes.

| Step                                               | Function                  | Who can call it                |
| -------------------------------------------------- | ------------------------- | ------------------------------ |
| Show taken seats                                   | `get_taken_seats`         | everyone                       |
| Reserve seats (atomic, price from DB, unpaid hold) | `book_seats`              | signed-in users                |
| Abandon an unpaid booking                          | `cancel_pending_booking`  | the booking owner              |
| Mark an online payment as paid                     | `confirm_booking_payment` | **server only** (service role) |
| Check a ticket / collect cash at the counter       | `scan_ticket`             | admins, agents of that cinema  |

Unpaid holds expire after 15 minutes (online) or 15 minutes before the show
(pay at the counter, max 2 pending per user).

**Online payment is simulated** when `PAYMENT_MODE=simulation`. To go live,
implement a real provider in `src/lib/payments.functions.ts` (create the
checkout, return `{ status: "redirect", url }`) and add a webhook route that
verifies the provider's signature and then calls `confirm_booking_payment`.
Without `PAYMENT_MODE`, only "pay at the counter" works.
