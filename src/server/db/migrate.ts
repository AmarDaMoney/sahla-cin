// Applique les migrations (dossier drizzle/) au démarrage du serveur, quelle
// que soit la commande de lancement utilisée par l'hébergeur. Sans effet si la
// base est déjà à jour. Un verrou empêche deux instances de migrer en même temps.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { envValue } from "../config";

const LOCK_ID = 727_272;
let pending: Promise<void> | undefined;

export function ensureMigrated(): Promise<void> {
  pending ??= run().catch((error) => {
    pending = undefined; // nouvel essai à la prochaine requête
    throw error;
  });
  return pending;
}

async function run() {
  const url = envValue("DATABASE_URL");
  if (!url) return;
  const folder = resolve(process.cwd(), "drizzle");
  if (!existsSync(folder)) {
    console.error(`[migrations] dossier introuvable : ${folder}`);
    return;
  }
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${LOCK_ID})`;
    await migrate(drizzle(client), { migrationsFolder: folder });
    console.info("[migrations] base de données à jour");
  } finally {
    await client.end(); // libère aussi le verrou
  }
}
