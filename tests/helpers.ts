// Base Postgres en mémoire (PGlite) avec les vraies migrations de drizzle/.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { createHall } from "@/server/services/admin";
import type { Viewer } from "@/server/viewer";

export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

export async function createUser(db: Db, email: string, verified = true) {
  const [u] = await db
    .insert(schema.user)
    .values({ name: email.split("@")[0]!, email, emailVerified: verified })
    .returning();
  return u!;
}

export function viewerOf(
  u: { id: string; email: string; name: string },
  roles: Viewer["roles"] = [],
): Viewer {
  return { id: u.id, email: u.email, name: u.name, roles: ["client", ...roles] };
}

export const HOUR = 60 * 60_000;

// Ville, deux cinémas (une salle de 20 places chacun), un film.
export async function seedVenue(db: Db) {
  const [city] = await db.insert(schema.cities).values({ name: "Alger" }).returning();
  const [cinemaA] = await db
    .insert(schema.cinemas)
    .values({ name: "Cosmos", city_id: city!.id })
    .returning();
  const [cinemaB] = await db
    .insert(schema.cinemas)
    .values({ name: "Ibn Zaydoun", city_id: city!.id })
    .returning();
  const hallA = await createHall(db, {
    cinema_id: cinemaA!.id,
    name: "Alpha",
    capacity: 20,
    type: "standard",
  });
  const hallB = await createHall(db, {
    cinema_id: cinemaB!.id,
    name: "Salle 1",
    capacity: 20,
    type: "standard",
  });
  const [movie] = await db
    .insert(schema.movies)
    .values({ title: "Poupiya", duration_minutes: 90 })
    .returning();
  const seatsA = await db.query.seats.findMany({
    where: (s, { eq }) => eq(s.hall_id, hallA.id),
    orderBy: (s, { asc }) => [asc(s.row_label), asc(s.seat_number)],
  });
  const seatsB = await db.query.seats.findMany({ where: (s, { eq }) => eq(s.hall_id, hallB.id) });
  return {
    city: city!,
    cinemaA: cinemaA!,
    cinemaB: cinemaB!,
    hallA,
    hallB,
    movie: movie!,
    seatsA,
    seatsB,
  };
}

export async function addScreening(
  db: Db,
  hallId: string,
  movieId: string,
  startsInMs: number,
  opts: { price?: number; status?: "brouillon" | "en_revue" | "publie" } = {},
) {
  const [s] = await db
    .insert(schema.screenings)
    .values({
      hall_id: hallId,
      movie_id: movieId,
      starts_at: new Date(Date.now() + startsInMs),
      price: opts.price ?? 600,
      status: opts.status ?? "publie",
    })
    .returning();
  return s!;
}
