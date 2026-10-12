import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import {
  bookings,
  cinemas,
  cities,
  halls,
  media,
  movies,
  screenings,
  seats,
} from "@/server/db/schema";
import { deleteCinema, deleteCity, deleteHall, deleteMovie } from "@/server/services/admin";
import { bookSeats, cancelPendingBooking } from "@/server/services/booking";
import { saveImage } from "@/server/services/media";
import { addScreening, createTestDb, createUser, HOUR, seedVenue } from "./helpers";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let db: Db;
let venue: Awaited<ReturnType<typeof seedVenue>>;
let alice: { id: string };

beforeEach(async () => {
  db = await createTestDb();
  venue = await seedVenue(db);
  alice = await createUser(db, "alice@example.com");
});

async function sell(screeningId: string) {
  return bookSeats(db, alice.id, {
    screeningId,
    seatIds: [venue.seatsA[0]!.id],
    paymentMethod: "cib",
  });
}

describe("admin deletions", () => {
  it("deletes a film with its unsold showings and its unused poster", async () => {
    const { url } = await saveImage(db, alice.id, PNG_1PX);
    await db.update(movies).set({ poster_url: url }).where(eq(movies.id, venue.movie.id));
    await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    // Réservation annulée : ne compte pas comme une vente.
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 6 * HOUR);
    const b = await sell(s.id);
    await cancelPendingBooking(db, alice.id, b.bookingId);

    await deleteMovie(db, venue.movie.id);
    expect(await db.select().from(movies)).toHaveLength(0);
    expect(await db.select().from(screenings)).toHaveLength(0);
    expect(await db.select().from(bookings)).toHaveLength(0);
    expect(await db.select().from(media)).toHaveLength(0);
  });

  it("keeps a poster another film still uses", async () => {
    const { url } = await saveImage(db, alice.id, PNG_1PX);
    await db.update(movies).set({ poster_url: url });
    await db.insert(movies).values({ title: "Autre", duration_minutes: 90, poster_url: url });
    await deleteMovie(db, venue.movie.id);
    expect(await db.select().from(media)).toHaveLength(1);
  });

  it("refuses to delete anything with tickets sold", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    await sell(s.id);
    const sold = { code: "HAS_SOLD_TICKETS" };
    await expect(deleteMovie(db, venue.movie.id)).rejects.toMatchObject(sold);
    await expect(deleteHall(db, venue.hallA.id)).rejects.toMatchObject(sold);
    await expect(deleteCinema(db, venue.cinemaA.id)).rejects.toMatchObject(sold);
    expect(await db.select().from(screenings)).toHaveLength(1);
    expect(await db.select().from(bookings)).toHaveLength(1);
  });

  it("deletes a screen with its seats, and a cinema with its screens", async () => {
    await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    await deleteHall(db, venue.hallA.id);
    expect(await db.select().from(seats).where(eq(seats.hall_id, venue.hallA.id))).toHaveLength(0);
    expect(await db.select().from(screenings)).toHaveLength(0);

    await addScreening(db, venue.hallB.id, venue.movie.id, 3 * HOUR);
    await deleteCinema(db, venue.cinemaB.id);
    expect(await db.select().from(cinemas).where(eq(cinemas.id, venue.cinemaB.id))).toHaveLength(0);
    expect(await db.select().from(halls).where(eq(halls.id, venue.hallB.id))).toHaveLength(0);
    expect(await db.select().from(movies)).toHaveLength(1);
  });

  it("deletes a city only once it has no cinema", async () => {
    await expect(deleteCity(db, venue.city.id)).rejects.toMatchObject({ code: "CITY_HAS_CINEMAS" });
    await deleteCinema(db, venue.cinemaA.id);
    await deleteCinema(db, venue.cinemaB.id);
    await deleteCity(db, venue.city.id);
    expect(await db.select().from(cities)).toHaveLength(0);
  });

  it("reports missing entries", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    await expect(deleteMovie(db, missing)).rejects.toMatchObject({ code: "MOVIE_NOT_FOUND" });
    await expect(deleteCinema(db, missing)).rejects.toMatchObject({ code: "CINEMA_NOT_FOUND" });
  });
});
