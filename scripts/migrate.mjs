// Applique les migrations de drizzle/ (le serveur le fait aussi au démarrage,
// voir src/server/db/migrate.ts). Utile en local : bun run db:migrate
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant");
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  await client`select pg_advisory_lock(727272)`;
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  console.log("Migrations appliquées");
} finally {
  await client.end();
}
