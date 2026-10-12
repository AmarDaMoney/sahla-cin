// Administration : catalogue de films, lieux, salles, équipes et rôles.
import { and, asc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "../db/client";
import {
  bookings,
  cinema_staff,
  cinemas,
  cities,
  halls,
  media,
  movies,
  screenings,
  seats,
  user,
  user_roles,
} from "../db/schema";
import { AppError, isUniqueViolation } from "@/lib/errors";
import type { AppRole } from "../viewer";

type PublishStatus = (typeof screenings.$inferSelect)["status"];
type HallType = (typeof halls.$inferSelect)["type"];

export function listScreeningsByStatus(db: Db, status: PublishStatus) {
  return db.query.screenings.findMany({
    where: eq(screenings.status, status),
    orderBy: asc(screenings.starts_at),
    with: {
      movie: true,
      hall: {
        columns: { id: true, name: true },
        with: { cinema: { columns: { id: true, name: true } } },
      },
    },
  });
}

export type MovieInput = {
  id?: string | undefined;
  title: string;
  title_ar: string | null;
  title_en: string | null;
  original_title: string | null;
  original_language: string | null;
  duration_minutes: number;
  genre: string | null;
  synopsis: string | null;
  synopsis_ar: string | null;
  synopsis_en: string | null;
  poster_url: string | null;
  trailer_url: string | null;
  age_rating: string | null;
};

export async function upsertMovie(db: Db, input: MovieInput) {
  const { id, ...values } = input;
  const [row] = id
    ? await db.update(movies).set(values).where(eq(movies.id, id)).returning({ id: movies.id })
    : await db.insert(movies).values(values).returning({ id: movies.id });
  if (!row) throw new AppError("MOVIE_NOT_FOUND", "Film introuvable");
  return row;
}

export async function createCity(db: Db, name: string) {
  try {
    const [row] = await db.insert(cities).values({ name }).returning({ id: cities.id });
    return row!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("CITY_EXISTS", "Cette ville existe déjà");
    throw e;
  }
}

export async function createCinema(
  db: Db,
  input: {
    name: string;
    city_id: string;
    address: string | null;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
    description: string | null;
  },
) {
  const [row] = await db.insert(cinemas).values(input).returning({ id: cinemas.id });
  return row!;
}

const SEATS_PER_ROW = 10;

// Plan de salle : rangées de 10 sièges (A1…A10, B1…), même logique que le seed.
export function seatLayout(capacity: number, type: HallType) {
  return Array.from({ length: capacity }, (_, i) => ({
    row_label: String.fromCharCode(65 + Math.floor(i / SEATS_PER_ROW)),
    seat_number: (i % SEATS_PER_ROW) + 1,
    seat_type: type,
  }));
}

export async function createHall(
  db: Db,
  input: { cinema_id: string; name: string; capacity: number; type: HallType },
) {
  if (input.capacity > 26 * SEATS_PER_ROW) {
    throw new AppError("INVALID_CAPACITY", `Capacité maximale : ${26 * SEATS_PER_ROW} places`);
  }
  try {
    return await db.transaction(async (tx) => {
      const [hall] = await tx.insert(halls).values(input).returning({ id: halls.id });
      await tx
        .insert(seats)
        .values(seatLayout(input.capacity, input.type).map((s) => ({ ...s, hall_id: hall!.id })));
      return hall!;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("HALL_EXISTS", "Une salle porte déjà ce nom dans ce cinéma");
    }
    throw e;
  }
}

/* ------------------------------------------------------------ Suppressions */

// Une fiche (film, salle, cinéma) ne peut être supprimée que si aucun billet
// n'a été vendu pour ses séances : les ventes restent dans l'historique. Ses
// séances sans billet (et les réservations annulées) partent avec elle.
async function deleteScreeningsWhere(tx: Tx, where: SQL) {
  const ids = (await tx.select({ id: screenings.id }).from(screenings).where(where)).map(
    (s) => s.id,
  );
  if (!ids.length) return;
  // Verrouille les séances : aucune réservation ne peut arriver pendant la suppression.
  await tx
    .select({ id: screenings.id })
    .from(screenings)
    .where(inArray(screenings.id, ids))
    .for("update");
  const [sold] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(inArray(bookings.screening_id, ids), ne(bookings.status, "annule")))
    .limit(1);
  if (sold) {
    throw new AppError(
      "HAS_SOLD_TICKETS",
      "Des billets ont été vendus pour ses séances : la fiche est conservée pour l'historique",
    );
  }
  await tx.delete(bookings).where(inArray(bookings.screening_id, ids));
  await tx.delete(screenings).where(inArray(screenings.id, ids));
}

// Supprime l'affiche stockée chez nous si plus aucun film ne l'utilise.
async function dropUnusedPoster(tx: Tx, url: string | null) {
  const id = url?.match(/^\/api\/media\/([0-9a-f-]{36})$/)?.[1];
  if (!id) return;
  const [used] = await tx
    .select({ id: movies.id })
    .from(movies)
    .where(eq(movies.poster_url, url!))
    .limit(1);
  if (!used) await tx.delete(media).where(eq(media.id, id));
}

export async function deleteMovie(db: Db, id: string) {
  await db.transaction(async (tx) => {
    const [movie] = await tx
      .select({ poster_url: movies.poster_url })
      .from(movies)
      .where(eq(movies.id, id));
    if (!movie) throw new AppError("MOVIE_NOT_FOUND", "Film introuvable");
    await deleteScreeningsWhere(tx, eq(screenings.movie_id, id));
    await tx.delete(movies).where(eq(movies.id, id));
    await dropUnusedPoster(tx, movie.poster_url);
  });
}

export async function deleteHall(db: Db, id: string) {
  await db.transaction(async (tx) => {
    const [hall] = await tx.select({ id: halls.id }).from(halls).where(eq(halls.id, id));
    if (!hall) throw new AppError("HALL_NOT_FOUND", "Salle introuvable");
    await deleteScreeningsWhere(tx, eq(screenings.hall_id, id));
    await tx.delete(halls).where(eq(halls.id, id)); // sièges supprimés en cascade
  });
}

export async function deleteCinema(db: Db, id: string) {
  await db.transaction(async (tx) => {
    const [cinema] = await tx.select({ id: cinemas.id }).from(cinemas).where(eq(cinemas.id, id));
    if (!cinema) throw new AppError("CINEMA_NOT_FOUND", "Cinéma introuvable");
    const hallIds = tx.select({ id: halls.id }).from(halls).where(eq(halls.cinema_id, id));
    await deleteScreeningsWhere(tx, inArray(screenings.hall_id, hallIds));
    await tx.delete(halls).where(eq(halls.cinema_id, id));
    await tx.delete(cinemas).where(eq(cinemas.id, id)); // équipe détachée en cascade
  });
}

export async function deleteCity(db: Db, id: string) {
  await db.transaction(async (tx) => {
    const [city] = await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, id));
    if (!city) throw new AppError("CITY_NOT_FOUND", "Ville introuvable");
    const [cinema] = await tx
      .select({ id: cinemas.id })
      .from(cinemas)
      .where(eq(cinemas.city_id, id))
      .limit(1);
    if (cinema) {
      throw new AppError("CITY_HAS_CINEMAS", "Supprimez d'abord les cinémas de cette ville");
    }
    await tx.delete(cities).where(eq(cities.id, id));
  });
}

async function userIdByEmail(db: Db, email: string) {
  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email.trim().toLowerCase()));
  if (!u) throw new AppError("USER_NOT_FOUND", "Aucun compte avec cet e-mail");
  return u.id;
}

// Attribue un rôle à partir de l'e-mail du compte. Contributeurs et agents
// sont rattachés à un cinéma (obligatoire pour qu'ils puissent travailler).
export async function grantRole(
  db: Db,
  input: { email: string; role: AppRole; cinemaId?: string | undefined },
) {
  const userId = await userIdByEmail(db, input.email);
  const needsCinema = input.role === "contributeur" || input.role === "agent_guichet";
  if (needsCinema && !input.cinemaId) {
    throw new AppError("CINEMA_REQUIRED", "Choisissez le cinéma de rattachement");
  }
  await db.transaction(async (tx) => {
    await tx.insert(user_roles).values({ user_id: userId, role: input.role }).onConflictDoNothing();
    if (needsCinema && input.cinemaId) {
      await tx
        .insert(cinema_staff)
        .values({ user_id: userId, cinema_id: input.cinemaId })
        .onConflictDoNothing();
    }
  });
}

export async function revokeRole(db: Db, input: { userId: string; role: AppRole }) {
  await db.transaction(async (tx) => {
    await tx
      .delete(user_roles)
      .where(and(eq(user_roles.user_id, input.userId), eq(user_roles.role, input.role)));
    // Plus aucun rôle de cinéma : on retire aussi les rattachements.
    const remaining = await tx
      .select({ role: user_roles.role })
      .from(user_roles)
      .where(
        and(
          eq(user_roles.user_id, input.userId),
          inArray(user_roles.role, ["contributeur", "agent_guichet"]),
        ),
      );
    if (!remaining.length) {
      await tx.delete(cinema_staff).where(eq(cinema_staff.user_id, input.userId));
    }
  });
}

export async function removeStaff(db: Db, input: { userId: string; cinemaId: string }) {
  await db
    .delete(cinema_staff)
    .where(and(eq(cinema_staff.user_id, input.userId), eq(cinema_staff.cinema_id, input.cinemaId)));
}

// Comptes ayant un rôle autre que « client », avec leurs cinémas.
export async function listTeam(db: Db) {
  const roles = await db
    .select({ user_id: user_roles.user_id, role: user_roles.role })
    .from(user_roles)
    .where(ne(user_roles.role, "client"));
  const ids = [...new Set(roles.map((r) => r.user_id))];
  if (!ids.length) return [];
  const users = await db.query.user.findMany({
    where: inArray(user.id, ids),
    columns: { id: true, name: true, email: true },
    with: { staff: { with: { cinema: { columns: { id: true, name: true } } } } },
  });
  return users
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: roles.filter((r) => r.user_id === u.id).map((r) => r.role),
      cinemas: u.staff.map((s) => s.cinema),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}
