# Notes for coding agents

- Database changes go in a new file under `supabase/migrations/` (never edit an
  applied migration). Update `src/integrations/supabase/types.ts` to match
  (`npx supabase gen types typescript --linked > src/integrations/supabase/types.ts`).
- Customers must never write to `bookings`, `booking_seats` or `tickets`
  directly: use the SQL functions described in README.md.
- `SUPABASE_SERVICE_ROLE_KEY` is only used in server code
  (`client.server.ts`, server functions). Never import it from a component.
- Run `bun run typecheck`, `bun run lint` and `bun run build` before pushing.
