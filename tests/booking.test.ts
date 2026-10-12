import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { bookings } from "@/server/db/schema";
import {
  bookSeats,
  cancelPendingBooking,
  confirmPayment,
  listMyTickets,
} from "@/server/services/booking";
import { takenSeatIds } from "@/server/services/catalog";
import { addScreening, createTestDb, createUser, HOUR, seedVenue } from "./helpers";

let db: Db;
let venue: Awaited<ReturnType<typeof seedVenue>>;
let alice: { id: string };
let bob: { id: string };

beforeEach(async () => {
  db = await createTestDb();
  venue = await seedVenue(db);
  alice = await createUser(db, "alice@example.com");
  bob = await createUser(db, "bob@example.com");
});

const ids = (n: number, offset = 0) => venue.seatsA.slice(offset, offset + n).map((s) => s.id);

describe("bookSeats", () => {
  it("creates an unpaid hold priced from the database", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR, { price: 700 });
    const res = await bookSeats(db, alice.id, {
      screeningId: s.id,
      seatIds: ids(2),
      paymentMethod: "cib",
    });
    expect(res.totalAmount).toBe(1400);
    expect(res.qrCode).toMatch(/^BCDZ-[0-9A-F]{24}$/);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, res.bookingId));
    expect(b!.status).toBe("en_attente_paiement");
    expect(b!.expires_at!.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000 + 1000);
  });

  it("never sells the same seat twice, and every customer sees taken seats", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    await bookSeats(db, alice.id, { screeningId: s.id, seatIds: ids(2), paymentMethod: "cib" });
    expect(await takenSeatIds(db, s.id)).toHaveLength(2);
    await expect(
      bookSeats(db, bob.id, { screeningId: s.id, seatIds: ids(2, 1), paymentMethod: "cib" }),
    ).rejects.toMatchObject({ code: "SEATS_TAKEN" });
    // La tentative échouée ne laisse aucune trace.
    expect(await db.select().from(bookings)).toHaveLength(1);
  });

  it("lets only one of two simultaneous bookings win", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    const results = await Promise.allSettled([
      bookSeats(db, alice.id, { screeningId: s.id, seatIds: ids(1), paymentMethod: "cib" }),
      bookSeats(db, bob.id, { screeningId: s.id, seatIds: ids(1), paymentMethod: "cib" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await takenSeatIds(db, s.id)).toHaveLength(1);
  });

  it("rejects invalid requests", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    const draft = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR, {
      status: "brouillon",
    });
    const soon = await addScreening(db, venue.hallA.id, venue.movie.id, 5 * 60_000);
    const book = (screeningId: string, seatIds: string[]) =>
      bookSeats(db, alice.id, { screeningId, seatIds, paymentMethod: "cib" });

    await expect(book(s.id, [venue.seatsB[0]!.id])).rejects.toMatchObject({
      code: "INVALID_SEATS",
    });
    await expect(book(s.id, ids(7))).rejects.toMatchObject({ code: "INVALID_SEAT_COUNT" });
    await expect(book(s.id, [])).rejects.toMatchObject({ code: "INVALID_SEAT_COUNT" });
    await expect(book(draft.id, ids(1))).rejects.toMatchObject({ code: "SCREENING_NOT_FOUND" });
    await expect(book(soon.id, ids(1))).rejects.toMatchObject({ code: "BOOKING_CLOSED" });
  });

  it("limits pay-at-counter holds and closes them 30 minutes before the show", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 5 * HOUR);
    const counter = (n: number) =>
      bookSeats(db, alice.id, { screeningId: s.id, seatIds: ids(1, n), paymentMethod: "espece" });
    const first = await counter(0);
    expect(first.expiresAt.getTime()).toBe(s.starts_at.getTime() - 15 * 60_000);
    await counter(1);
    await expect(counter(2)).rejects.toMatchObject({ code: "TOO_MANY_PENDING" });

    const soon = await addScreening(db, venue.hallA.id, venue.movie.id, 20 * 60_000);
    await expect(
      bookSeats(db, bob.id, { screeningId: soon.id, seatIds: ids(1), paymentMethod: "espece" }),
    ).rejects.toMatchObject({ code: "COUNTER_CLOSED" });
  });

  it("releases expired holds so the seat can be sold again", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    const hold = await bookSeats(db, alice.id, {
      screeningId: s.id,
      seatIds: ids(1),
      paymentMethod: "cib",
    });
    await db
      .update(bookings)
      .set({ expires_at: new Date(Date.now() - 60_000) })
      .where(eq(bookings.id, hold.bookingId));

    expect(await takenSeatIds(db, s.id)).toHaveLength(0);
    await bookSeats(db, bob.id, { screeningId: s.id, seatIds: ids(1), paymentMethod: "cib" });

    const [old] = await db.select().from(bookings).where(eq(bookings.id, hold.bookingId));
    expect(old).toMatchObject({ status: "annule", cancel_reason: "expire" });
    expect(
      await confirmPayment(db, { bookingId: hold.bookingId, amount: 600, reference: "LATE" }),
    ).toBe("expired_refund_needed");
  });
});

describe("confirmPayment", () => {
  it("checks the amount and is idempotent", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    const { bookingId } = await bookSeats(db, alice.id, {
      screeningId: s.id,
      seatIds: ids(2),
      paymentMethod: "dahabia",
    });
    expect(await confirmPayment(db, { bookingId, amount: 1, reference: "X" })).toBe(
      "amount_mismatch",
    );
    expect(await confirmPayment(db, { bookingId, amount: 1200, reference: "PSP-1" })).toBe(
      "confirmed",
    );
    expect(await confirmPayment(db, { bookingId, amount: 1200, reference: "PSP-1" })).toBe(
      "already_confirmed",
    );
    const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(b).toMatchObject({ status: "confirme", payment_reference: "PSP-1" });
  });
});

describe("cancelPendingBooking", () => {
  it("only lets the owner cancel, and frees the seats", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    const { bookingId } = await bookSeats(db, alice.id, {
      screeningId: s.id,
      seatIds: ids(2),
      paymentMethod: "cib",
    });
    expect(await cancelPendingBooking(db, bob.id, bookingId)).toBe(false);
    expect(await takenSeatIds(db, s.id)).toHaveLength(2);
    expect(await cancelPendingBooking(db, alice.id, bookingId)).toBe(true);
    expect(await takenSeatIds(db, s.id)).toHaveLength(0);
  });
});

describe("listMyTickets", () => {
  it("returns only the caller's tickets with seats and screening", async () => {
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    await bookSeats(db, alice.id, { screeningId: s.id, seatIds: ids(2), paymentMethod: "cib" });
    await bookSeats(db, bob.id, { screeningId: s.id, seatIds: ids(1, 5), paymentMethod: "cib" });
    const mine = await listMyTickets(db, alice.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.booking.booking_seats).toHaveLength(2);
    expect(mine[0]!.booking.screening.movie.title).toBe("Poupiya");
    expect(mine[0]!.booking.screening.hall.cinema.name).toBe("Cosmos");
  });
});

describe("sendBookingEmail", () => {
  it("emails the customer a summary with the ticket reference", async () => {
    const { sendBookingEmail } = await import("@/server/services/notifications");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const s = await addScreening(db, venue.hallA.id, venue.movie.id, 3 * HOUR);
    const { bookingId, qrCode } = await bookSeats(db, alice.id, {
      screeningId: s.id,
      seatIds: ids(2),
      paymentMethod: "espece",
    });
    await sendBookingEmail(db, bookingId);
    const sent = info.mock.calls.map((c) => String(c[0])).join("\n");
    expect(sent).toContain("alice@example.com");
    expect(sent).toContain(qrCode);
    expect(sent).toContain("A1, A2");
    expect(sent).toContain("à régler au guichet");
  });
});
