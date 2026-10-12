import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { envValue } from "../config";
import * as schema from "./schema";

// Type commun à la base de production (postgres.js) et à celle des tests (PGlite).
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    const url = envValue("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL manquant (voir .env.example)");
    db = drizzle(postgres(url, { max: 10 }), { schema }) as unknown as Db;
  }
  return db;
}
