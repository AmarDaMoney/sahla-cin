import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { bookings, cinema_staff, screenings } from "@/server/db/schema";
import { grantRole, listTeam, revokeRole, seatLayout } from "@/server/services/admin";
import { bookSeats, cancelPendingBooking, confirmPayment } from "@/server/services/booking";
import {
  createScreening,
  deleteScreening,
  listManagedCinemas,
  parseAlgiersLocal,
  setScreeningStatus,
} from "@/server/services/programme";
import { scanTicket } from "@/server/services/scan";
import { addScreening, createTestDb, createUser, HOUR, seedVenue, viewerOf } from "./helpers";

let db: Db;
let venue: Awaited<ReturnType<typeof seedVenue>>;

beforeEach(async () => {
  db = await createTestDb();
  venue = await seedVenue(db);
});

async function agentOf(cinemaId: string, email = "agent@example.com") {
  const u = await createUser(db, email);
  await db.insert(cinema_staff).values({ user_id: u.id, cinema_id: cinemaId });
  return viewerOf(u, ["agent_guichet"]);
}

async function ticket(startsInMs: number, paymentMethod: "cib" | "espece" = "espece") {
  const customer = await createUser(db, `c${Math.random()}@example.com`);
  const s = await addScreening(db, venue.hallA.id, venue.movie.id, startsInMs);
  const b = await bookSeats(db, customer.id, {
    screeningId: s.id,
    seatIds: [venue.seatsA[0]!.id],
    paymentMethod,
  });
  return { ...b, customer, screening: s };
}

describe("scanTicket", () => {
  it("collects cash for counter bookings, then refuses a second entry", async () => {
    const agent = await agentOf(venue.cinemaA.id);
    const t = await ticket(HOUR);
    expect(await scanTicket(db, agent, t.qrCode)).toMatchObject({ outcome: "unpaid", amount: 600 });
    expect(await scanTicket(db, agent, t.qrCode.toLowerCase(), true)).toMatchObject({
      outcome: "ok",
    });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, t.bookingId));
    expect(b!.status).toBe("confirme");
    expect((await scanTicket(db, agent, t.qrCode)).outcome).toBe("used");
  });

  it("accepts a paid online ticket", async () => {
    const agent = await agentOf(venue.cinemaA.id);
    const t = await ticket(HOUR, "cib");
    await confirmPayment(db, { bookingId: t.bookingId, amount: 600, reference: "SIM" });
    expect((await scanTicket(db, agent, t.qrCode)).outcome).toBe("ok");
  });

  it("rejects other cinemas, cancelled, too early and unknown tickets", async () => {
    const otherAgent = await agentOf(venue.cinemaB.id, "other@example.com");
    const agent = await agentOf(venue.cinemaA.id);
    const t = await ticket(HOUR);
    expect(await scanTicket(db, otherAgent, t.qrCode)).toMatchObject({
      outcome: "wrong_cinema",
      info: "Cosmos",
    });

    await cancelPendingBooking(db, t.customer.id, t.bookingId);
    expect((await scanTicket(db, agent, t.qrCode)).outcome).toBe("cancelled");

    const later = await ticket(2 * 24 * HOUR);
    expect((await scanTicket(db, agent, later.qrCode)).outcome).toBe("too_early");
    expect((await scanTicket(db, agent, "BCDZ-NOPE")).outcome).toBe("invalid");
  });

  it("rejects tickets for a finished screening", async () => {
    const agent = await agentOf(venue.cinemaA.id);
    const t = await ticket(HOUR);
    await db
      .update(screenings)
      .set({ starts_at: new Date(Date.now() - 3 * HOUR) })
      .where(eq(screenings.id, t.screening.id));
    expect((await scanTicket(db, agent, t.qrCode)).outcome).toBe("expired");
  });

  it("is forbidden to customers", async () => {
    const u = await createUser(db, "client@example.com");
    const t = await ticket(HOUR);
    await expect(scanTicket(db, viewerOf(u), t.qrCode)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("programme", () => {
  it("parses Algiers local time (UTC+1)", () => {
    expect(parseAlgiersLocal("2026-11-02T20:30").toISOString()).toBe("2026-11-02T19:30:00.000Z");
    expect(() => parseAlgiersLocal("demain")).toThrow();
  });

  it("lets a contributor draft and submit for their own cinema only", async () => {
    const u = await createUser(db, "contrib@example.com");
    const contributor = viewerOf(u, ["contributeur"]);
    const input = {
      hallId: venue.hallA.id,
      movieId: venue.movie.id,
      startsAtLocal: "2099-01-01T20:00",
      price: 500,
      audioLanguage: "VF" as const,
    };
    expect(await listManagedCinemas(db, contributor)).toHaveLength(0);
    await expect(createScreening(db, contributor, input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await db.insert(cinema_staff).values({ user_id: u.id, cinema_id: venue.cinemaA.id });
    const { id } = await createScreening(db, contributor, input);
    await expect(
      createScreening(db, contributor, { ...input, hallId: venue.hallB.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createScreening(db, contributor, { ...input, startsAtLocal: "2000-01-01T20:00" }),
    ).rejects.toMatchObject({ code: "PAST_DATE" });

    await expect(setScreeningStatus(db, contributor, [id], "publie")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await setScreeningStatus(db, contributor, [id], "en_revue")).toBe(1);
    await expect(setScreeningStatus(db, contributor, [id], "en_revue")).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });

    const admin = viewerOf(await createUser(db, "admin@example.com"), ["admin"]);
    expect(await setScreeningStatus(db, admin, [id], "publie")).toBe(1);
    await expect(deleteScreening(db, contributor, id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses to delete a screening with sold tickets", async () => {
    const admin = viewerOf(await createUser(db, "admin@example.com"), ["admin"]);
    const t = await ticket(3 * HOUR);
    await expect(deleteScreening(db, admin, t.screening.id)).rejects.toMatchObject({
      code: "HAS_BOOKINGS",
    });
    await cancelPendingBooking(db, t.customer.id, t.bookingId);
    await deleteScreening(db, admin, t.screening.id);
  });
});

describe("admin", () => {
  it("builds seat maps in rows of 10", () => {
    const layout = seatLayout(23, "standard");
    expect(layout).toHaveLength(23);
    expect(layout[0]).toMatchObject({ row_label: "A", seat_number: 1 });
    expect(layout[22]).toMatchObject({ row_label: "C", seat_number: 3 });
  });

  it("grants roles by email, requires a cinema for staff, and cleans up on revoke", async () => {
    const u = await createUser(db, "Agent@Example.com");
    await expect(
      grantRole(db, { email: "nobody@example.com", role: "admin" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      grantRole(db, { email: "agent@example.com", role: "agent_guichet" }),
    ).rejects.toMatchObject({ code: "CINEMA_REQUIRED" });

    await grantRole(db, {
      email: "agent@example.com",
      role: "agent_guichet",
      cinemaId: venue.cinemaA.id,
    });
    const team = await listTeam(db);
    expect(team).toEqual([
      expect.objectContaining({ id: u.id, roles: ["agent_guichet"], cinemas: [expect.anything()] }),
    ]);

    await revokeRole(db, { userId: u.id, role: "agent_guichet" });
    expect(await listTeam(db)).toEqual([]);
    expect(await db.select().from(cinema_staff)).toEqual([]);
  });
});
