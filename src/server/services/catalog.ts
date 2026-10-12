// Lecture publique : villes, cinémas, films, séances publiées, plan de salle.
import { and, asc, eq, gt, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { booking_seats, bookings, cities, movies, screenings, seats } from "../db/schema";
import { isAdmin, type Viewer } from "../viewer";

const screeningWith = {
  movie: true,
  hall: {
    columns: { id: true, name: true, type: true, capacity: true },
    with: {
      cinema: {
        columns: {
          id: true,
          name: true,
          address: true,
          latitude: true,
          longitude: true,
          city_id: true,
        },
        with: { city: { columns: { id: true, name: true, name_ar: true, name_en: true } } },
      },
    },
  },
} as const;

export function listCities(db: Db) {
  return db.query.cities.findMany({ orderBy: asc(cities.name) });
}

export function listCinemas(db: Db) {
  return db.query.cinemas.findMany({
    orderBy: (c, { asc }) => asc(c.name),
    with: {
      city: { columns: { id: true, name: true, name_ar: true, name_en: true } },
      halls: { columns: { id: true, name: true, type: true, capacity: true } },
    },
  });
}

export async function getCinema(db: Db, id: string) {
  return (
    (await db.query.cinemas.findFirst({
      where: (c, { eq }) => eq(c.id, id),
      with: {
        city: { columns: { id: true, name: true, name_ar: true, name_en: true } },
        halls: { columns: { id: true, name: true, type: true, capacity: true } },
      },
    })) ?? null
  );
}

export function listMovies(db: Db) {
  return db.query.movies.findMany({ orderBy: asc(movies.title) });
}

export async function getMovie(db: Db, id: string) {
  return (await db.query.movies.findFirst({ where: (m, { eq }) => eq(m.id, id) })) ?? null;
}

export function listPublishedScreenings(db: Db, now = new Date()) {
  return db.query.screenings.findMany({
    where: and(eq(screenings.status, "publie"), gt(screenings.starts_at, now)),
    orderBy: asc(screenings.starts_at),
    with: screeningWith,
  });
}

export type ScreeningFull = Awaited<ReturnType<typeof listPublishedScreenings>>[number];

// Séance publiée, ou brouillon visible par l'équipe concernée / un admin.
export async function getScreening(db: Db, viewer: Viewer | null, id: string) {
  const s = await db.query.screenings.findFirst({
    where: (s, { eq }) => eq(s.id, id),
    with: screeningWith,
  });
  if (!s) return null;
  if (s.status === "publie" || isAdmin(viewer)) return s;
  return null;
}

export function listSeats(db: Db, hallId: string) {
  return db.query.seats.findMany({
    where: eq(seats.hall_id, hallId),
    orderBy: [asc(seats.row_label), asc(seats.seat_number)],
  });
}

// Sièges occupés : payés, ou réservés et pas encore expirés. Aucune donnée client.
export async function takenSeatIds(db: Db, screeningId: string, now = new Date()) {
  const rows = await db
    .select({ seat_id: booking_seats.seat_id })
    .from(booking_seats)
    .innerJoin(bookings, eq(bookings.id, booking_seats.booking_id))
    .where(
      and(
        eq(booking_seats.screening_id, screeningId),
        or(
          eq(bookings.status, "confirme"),
          and(eq(bookings.status, "en_attente_paiement"), gt(bookings.expires_at, now)),
        ),
      ),
    );
  return rows.map((r) => r.seat_id);
}
