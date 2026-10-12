// Programme des cinémas : les contributeurs saisissent des séances en
// brouillon et les soumettent ; un administrateur les publie.
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookings, cinema_staff, cinemas, halls, screenings } from "../db/schema";
import { AppError } from "@/lib/errors";
import { hasRole, isAdmin, type Viewer } from "../viewer";

type AudioLanguage = (typeof screenings.$inferSelect)["audio_language"];
type PublishStatus = (typeof screenings.$inferSelect)["status"];

// L'Algérie est à UTC+1 toute l'année (pas d'heure d'été).
export function parseAlgiersLocal(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new AppError("INVALID_DATE", "Date et heure invalides");
  }
  const date = new Date(`${value}:00+01:00`);
  if (Number.isNaN(date.getTime())) throw new AppError("INVALID_DATE", "Date et heure invalides");
  return date;
}

async function managedCinemaIds(db: Db, viewer: Viewer): Promise<string[] | "all"> {
  if (isAdmin(viewer)) return "all";
  if (!hasRole(viewer, "contributeur")) return [];
  const rows = await db
    .select({ cinema_id: cinema_staff.cinema_id })
    .from(cinema_staff)
    .where(eq(cinema_staff.user_id, viewer.id));
  return rows.map((r) => r.cinema_id);
}

async function assertManagesCinema(db: Db, viewer: Viewer, cinemaId: string) {
  const ids = await managedCinemaIds(db, viewer);
  if (ids !== "all" && !ids.includes(cinemaId)) {
    throw new AppError("FORBIDDEN", "Vous ne gérez pas ce cinéma");
  }
}

async function cinemaOfHall(db: Db, hallId: string) {
  const [hall] = await db
    .select({ cinema_id: halls.cinema_id })
    .from(halls)
    .where(eq(halls.id, hallId));
  if (!hall) throw new AppError("NOT_FOUND", "Salle introuvable");
  return hall.cinema_id;
}

export async function listManagedCinemas(db: Db, viewer: Viewer) {
  const ids = await managedCinemaIds(db, viewer);
  if (ids !== "all" && !ids.length) return [];
  return db.query.cinemas.findMany({
    where: ids === "all" ? undefined : inArray(cinemas.id, ids),
    orderBy: asc(cinemas.name),
    columns: { id: true, name: true },
    with: { halls: { columns: { id: true, name: true, capacity: true } } },
  });
}

export async function listCinemaScreenings(db: Db, viewer: Viewer, cinemaId: string) {
  await assertManagesCinema(db, viewer, cinemaId);
  const hallIds = (
    await db.select({ id: halls.id }).from(halls).where(eq(halls.cinema_id, cinemaId))
  ).map((h) => h.id);
  if (!hallIds.length) return [];
  return db.query.screenings.findMany({
    where: inArray(screenings.hall_id, hallIds),
    orderBy: asc(screenings.starts_at),
    with: { movie: true, hall: { columns: { id: true, name: true } } },
  });
}

export async function createScreening(
  db: Db,
  viewer: Viewer,
  input: {
    hallId: string;
    movieId: string;
    startsAtLocal: string;
    price: number;
    audioLanguage: AudioLanguage;
  },
  now = new Date(),
) {
  await assertManagesCinema(db, viewer, await cinemaOfHall(db, input.hallId));
  const startsAt = parseAlgiersLocal(input.startsAtLocal);
  if (startsAt <= now) throw new AppError("PAST_DATE", "La séance doit être dans le futur");
  const movie = await db.query.movies.findFirst({ where: (m, { eq }) => eq(m.id, input.movieId) });
  if (!movie) throw new AppError("NOT_FOUND", "Film introuvable");

  const [row] = await db
    .insert(screenings)
    .values({
      hall_id: input.hallId,
      movie_id: input.movieId,
      starts_at: startsAt,
      price: input.price,
      audio_language: input.audioLanguage,
      status: "brouillon",
      created_by: viewer.id,
    })
    .returning({ id: screenings.id });
  return row!;
}

// Contributeur : brouillon → en revue. Administrateur : tout changement.
export async function setScreeningStatus(
  db: Db,
  viewer: Viewer,
  ids: string[],
  status: PublishStatus,
) {
  if (!ids.length) return 0;
  if (!isAdmin(viewer)) {
    if (status !== "en_revue") throw new AppError("FORBIDDEN", "Seul un administrateur publie");
    const rows = await db.query.screenings.findMany({
      where: inArray(screenings.id, ids),
      columns: { id: true, status: true },
      with: { hall: { columns: { cinema_id: true } } },
    });
    if (rows.length !== ids.length) throw new AppError("NOT_FOUND", "Séance introuvable");
    for (const r of rows) {
      await assertManagesCinema(db, viewer, r.hall.cinema_id);
      if (r.status !== "brouillon") {
        throw new AppError("INVALID_STATUS", "Seuls les brouillons peuvent être soumis");
      }
    }
  }
  const updated = await db
    .update(screenings)
    .set({ status })
    .where(inArray(screenings.id, ids))
    .returning({ id: screenings.id });
  return updated.length;
}

export async function deleteScreening(db: Db, viewer: Viewer, id: string) {
  const s = await db.query.screenings.findFirst({
    where: eq(screenings.id, id),
    columns: { id: true, status: true },
    with: { hall: { columns: { cinema_id: true } } },
  });
  if (!s) throw new AppError("NOT_FOUND", "Séance introuvable");
  if (!isAdmin(viewer)) {
    await assertManagesCinema(db, viewer, s.hall.cinema_id);
    if (s.status === "publie") {
      throw new AppError("FORBIDDEN", "Une séance publiée ne peut être supprimée que par un admin");
    }
  }
  const [hasBookings] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.screening_id, id), ne(bookings.status, "annule")))
    .limit(1);
  if (hasBookings) {
    throw new AppError("HAS_BOOKINGS", "Des billets ont été vendus pour cette séance");
  }
  await db.transaction(async (tx) => {
    await tx.delete(bookings).where(eq(bookings.screening_id, id));
    await tx.delete(screenings).where(eq(screenings.id, id));
  });
}
