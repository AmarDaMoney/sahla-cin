// Programme des cinémas : les contributeurs saisissent des séances en
// brouillon et les soumettent ; un administrateur les publie.
import { and, asc, eq, gte, inArray, lt, lte, ne } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookings, cinema_staff, cinemas, halls, movies, screenings } from "../db/schema";
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

export async function assertManagesCinema(db: Db, viewer: Viewer, cinemaId: string) {
  const ids = await managedCinemaIds(db, viewer);
  if (ids !== "all" && !ids.includes(cinemaId)) {
    throw new AppError("NOT_YOUR_CINEMA", "Vous ne gérez pas ce cinéma");
  }
}

async function cinemaOfHall(db: Db, hallId: string) {
  const [hall] = await db
    .select({ cinema_id: halls.cinema_id })
    .from(halls)
    .where(eq(halls.id, hallId));
  if (!hall) throw new AppError("HALL_NOT_FOUND", "Salle introuvable");
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

export type NewScreening = {
  hallId: string;
  movieId: string;
  startsAt: Date;
  price: number;
  audioLanguage: AudioLanguage;
};

export type LineError = { line: number; code: string };

// Ménage entre deux séances d'une même salle.
export const CLEANING_MINUTES = 15;
const MAX_BATCH = 300;

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

// Vérifie puis crée des séances en brouillon, tout ou rien. Renvoie les
// erreurs par ligne (numérotées à partir de 1) au lieu de créer quoi que ce soit.
export async function createScreenings(
  db: Db,
  viewer: Viewer,
  items: NewScreening[],
  now = new Date(),
  opts: { dryRun?: boolean } = {},
): Promise<{ created: number; ids: string[]; errors: LineError[] }> {
  if (!items.length) return { created: 0, ids: [], errors: [] };
  if (items.length > MAX_BATCH) {
    throw new AppError("TOO_MANY_SCREENINGS", `${MAX_BATCH} séances maximum à la fois`);
  }

  return db.transaction(async (tx) => {
    const hallIds = [...new Set(items.map((i) => i.hallId))];
    // Verrouille les salles : deux saisies simultanées ne peuvent pas se chevaucher.
    const hallRows = await tx
      .select({ id: halls.id, cinema_id: halls.cinema_id })
      .from(halls)
      .where(inArray(halls.id, hallIds))
      .for("update");
    const managed = await managedCinemaIds(tx as unknown as Db, viewer);
    const movieRows = await tx
      .select({ id: movies.id, duration: movies.duration_minutes })
      .from(movies)
      .where(inArray(movies.id, [...new Set(items.map((i) => i.movieId))]));
    const duration = new Map(movieRows.map((m) => [m.id, m.duration]));

    const times = items.map((i) => i.startsAt.getTime());
    const existing = await tx
      .select({
        hall_id: screenings.hall_id,
        starts_at: screenings.starts_at,
        duration: movies.duration_minutes,
      })
      .from(screenings)
      .innerJoin(movies, eq(movies.id, screenings.movie_id))
      .where(
        and(
          inArray(screenings.hall_id, hallIds),
          gte(screenings.starts_at, new Date(Math.min(...times) - DAY)),
          lte(screenings.starts_at, new Date(Math.max(...times) + DAY)),
        ),
      );
    const busy = existing.map((e) => ({
      hall: e.hall_id,
      start: e.starts_at.getTime(),
      end: e.starts_at.getTime() + (e.duration + CLEANING_MINUTES) * 60_000,
    }));

    const errors: LineError[] = [];
    items.forEach((item, index) => {
      const line = index + 1;
      const hall = hallRows.find((h) => h.id === item.hallId);
      if (!hall) return errors.push({ line, code: "HALL_NOT_FOUND" });
      if (managed !== "all" && !managed.includes(hall.cinema_id)) {
        return errors.push({ line, code: "NOT_YOUR_CINEMA" });
      }
      const minutes = duration.get(item.movieId);
      if (minutes === undefined) return errors.push({ line, code: "MOVIE_NOT_FOUND" });
      if (Number.isNaN(item.startsAt.getTime())) return errors.push({ line, code: "INVALID_DATE" });
      if (item.startsAt <= now) return errors.push({ line, code: "PAST_DATE" });
      if (!Number.isInteger(item.price) || item.price < 0 || item.price > 100_000) {
        return errors.push({ line, code: "INVALID_PRICE" });
      }
      const start = item.startsAt.getTime();
      const end = start + (minutes + CLEANING_MINUTES) * 60_000;
      if (busy.some((b) => b.hall === item.hallId && overlaps(start, end, b.start, b.end))) {
        return errors.push({ line, code: "OVERLAP" });
      }
      // Les séances de ce lot comptent aussi pour les lignes suivantes.
      busy.push({ hall: item.hallId, start, end });
      return undefined;
    });
    if (errors.length) return { created: 0, ids: [], errors };
    if (opts.dryRun) return { created: items.length, ids: [], errors: [] };

    const rows = await tx
      .insert(screenings)
      .values(
        items.map((i) => ({
          hall_id: i.hallId,
          movie_id: i.movieId,
          starts_at: i.startsAt,
          price: i.price,
          audio_language: i.audioLanguage,
          status: "brouillon" as const,
          created_by: viewer.id,
        })),
      )
      .returning({ id: screenings.id });
    return { created: rows.length, ids: rows.map((r) => r.id), errors: [] };
  });
}

const ERROR_MESSAGES: Record<string, string> = {
  HALL_NOT_FOUND: "Salle introuvable",
  NOT_YOUR_CINEMA: "Vous ne gérez pas ce cinéma",
  MOVIE_NOT_FOUND: "Film introuvable",
  INVALID_DATE: "Date et heure invalides",
  PAST_DATE: "La séance doit être dans le futur",
  INVALID_PRICE: "Prix invalide",
  OVERLAP: "Une autre séance occupe déjà la salle à cet horaire",
};

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
  const { errors, ids } = await createScreenings(
    db,
    viewer,
    [{ ...input, startsAt: parseAlgiersLocal(input.startsAtLocal) }],
    now,
  );
  const code = errors[0]?.code;
  if (code) throw new AppError(code, ERROR_MESSAGES[code] ?? code);
  return { id: ids[0]! };
}

// Une séance pour chaque jour × chaque horaire (heure d'Alger).
export async function createScreeningBatch(
  db: Db,
  viewer: Viewer,
  input: {
    hallId: string;
    movieId: string;
    price: number;
    audioLanguage: AudioLanguage;
    dates: string[]; // AAAA-MM-JJ
    times: string[]; // HH:MM
  },
  now = new Date(),
) {
  const items = input.dates.flatMap((date) =>
    [...input.times].sort().map((time) => ({
      hallId: input.hallId,
      movieId: input.movieId,
      price: input.price,
      audioLanguage: input.audioLanguage,
      startsAt: parseAlgiersLocal(`${date}T${time}`),
    })),
  );
  return createScreenings(db, viewer, items, now);
}

const DAY = 24 * 60 * 60_000;

// Recopie les séances de 7 jours (à partir de fromDate, heure d'Alger) sur les
// 7 jours suivants, en brouillon. Les séances qui chevaucheraient une séance
// existante sont ignorées et comptées.
export async function copyWeek(
  db: Db,
  viewer: Viewer,
  input: { cinemaId: string; fromDate: string },
  now = new Date(),
) {
  await assertManagesCinema(db, viewer, input.cinemaId);
  const from = parseAlgiersLocal(`${input.fromDate}T00:00`);
  const to = new Date(from.getTime() + 7 * DAY);
  const source = await db
    .select({
      hall_id: screenings.hall_id,
      movie_id: screenings.movie_id,
      starts_at: screenings.starts_at,
      price: screenings.price,
      audio_language: screenings.audio_language,
    })
    .from(screenings)
    .innerJoin(halls, eq(halls.id, screenings.hall_id))
    .where(
      and(
        eq(halls.cinema_id, input.cinemaId),
        gte(screenings.starts_at, from),
        lt(screenings.starts_at, to),
      ),
    )
    .orderBy(asc(screenings.starts_at));

  let created = 0;
  let skipped = 0;
  // Une par une : une séance en conflit est ignorée sans bloquer les autres.
  for (const s of source) {
    const { errors } = await createScreenings(
      db,
      viewer,
      [
        {
          hallId: s.hall_id,
          movieId: s.movie_id,
          startsAt: new Date(s.starts_at.getTime() + 7 * DAY),
          price: s.price,
          audioLanguage: s.audio_language,
        },
      ],
      now,
    );
    if (errors.length) skipped++;
    else created++;
  }
  return { created, skipped };
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
    if (status !== "en_revue")
      throw new AppError("ADMIN_ONLY_PUBLISH", "Seul un administrateur publie");
    const rows = await db.query.screenings.findMany({
      where: inArray(screenings.id, ids),
      columns: { id: true, status: true },
      with: { hall: { columns: { cinema_id: true } } },
    });
    if (rows.length !== ids.length) throw new AppError("SCREENING_NOT_FOUND", "Séance introuvable");
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
  if (!s) throw new AppError("SCREENING_NOT_FOUND", "Séance introuvable");
  if (!isAdmin(viewer)) {
    await assertManagesCinema(db, viewer, s.hall.cinema_id);
    if (s.status === "publie") {
      throw new AppError(
        "PUBLISHED_DELETE_ADMIN",
        "Une séance publiée ne peut être supprimée que par un admin",
      );
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
