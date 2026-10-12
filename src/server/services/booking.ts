// Réservation, paiement et annulation. Toutes les écritures passent par ici,
// dans une transaction ; la contrainte UNIQUE (screening_id, seat_id) rend la
// double réservation impossible même en cas de requêtes simultanées.
import { randomBytes } from "node:crypto";
import { and, count, eq, gt, inArray, lt } from "drizzle-orm";
import type { Db, Tx } from "../db/client";
import { booking_seats, bookings, screenings, seats, tickets, user } from "../db/schema";
import { AppError, isUniqueViolation } from "@/lib/errors";

export type PaymentMethodId = (typeof bookings.$inferSelect)["payment_method"];

export const MAX_SEATS_PER_BOOKING = 6;
export const MAX_PENDING_COUNTER_BOOKINGS = 2;
const MINUTE = 60_000;
const ONLINE_HOLD = 15 * MINUTE;
const COUNTER_CUTOFF = 15 * MINUTE; // fin de la réservation au guichet avant la séance
const BOOKING_CUTOFF = 10 * MINUTE; // réservations closes avant la séance

export function newTicketCode() {
  return `BCDZ-${randomBytes(12).toString("hex").toUpperCase()}`;
}

// Libère les réservations non payées dont le délai est dépassé.
export async function releaseExpiredHolds(tx: Tx | Db, screeningId: string, now = new Date()) {
  const expired = await tx
    .update(bookings)
    .set({ status: "annule", cancelled_at: now, cancel_reason: "expire" })
    .where(
      and(
        eq(bookings.screening_id, screeningId),
        eq(bookings.status, "en_attente_paiement"),
        lt(bookings.expires_at, now),
      ),
    )
    .returning({ id: bookings.id });
  if (expired.length) {
    await tx.delete(booking_seats).where(
      inArray(
        booking_seats.booking_id,
        expired.map((b) => b.id),
      ),
    );
  }
  return expired.length;
}

export async function bookSeats(
  db: Db,
  userId: string,
  input: { screeningId: string; seatIds: string[]; paymentMethod: PaymentMethodId },
  now = new Date(),
) {
  const seatIds = [...new Set(input.seatIds)];
  if (seatIds.length < 1 || seatIds.length > MAX_SEATS_PER_BOOKING) {
    throw new AppError(
      "INVALID_SEAT_COUNT",
      `Choisissez entre 1 et ${MAX_SEATS_PER_BOOKING} sièges`,
    );
  }

  return db.transaction(async (tx) => {
    // Sérialise les réservations d'un même client (limite des réservations en attente).
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");

    const [screening] = await tx
      .select()
      .from(screenings)
      .where(and(eq(screenings.id, input.screeningId), eq(screenings.status, "publie")));
    if (!screening) throw new AppError("SCREENING_NOT_FOUND", "Séance introuvable");

    const startsAt = screening.starts_at.getTime();
    if (startsAt - now.getTime() <= BOOKING_CUTOFF) {
      throw new AppError("BOOKING_CLOSED", "Les réservations sont closes pour cette séance");
    }

    const [{ valid }] = (await tx
      .select({ valid: count() })
      .from(seats)
      .where(and(inArray(seats.id, seatIds), eq(seats.hall_id, screening.hall_id)))) as [
      { valid: number },
    ];
    if (valid !== seatIds.length) {
      throw new AppError("INVALID_SEATS", "Sièges invalides pour cette salle");
    }

    let expiresAt: Date;
    if (input.paymentMethod === "espece") {
      expiresAt = new Date(startsAt - COUNTER_CUTOFF);
      if (expiresAt.getTime() - now.getTime() < COUNTER_CUTOFF) {
        throw new AppError(
          "COUNTER_CLOSED",
          "Paiement au guichet indisponible moins de 30 min avant la séance",
        );
      }
      const [{ pending }] = (await tx
        .select({ pending: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.user_id, userId),
            eq(bookings.status, "en_attente_paiement"),
            eq(bookings.payment_method, "espece"),
            gt(bookings.expires_at, now),
          ),
        )) as [{ pending: number }];
      if (pending >= MAX_PENDING_COUNTER_BOOKINGS) {
        throw new AppError(
          "TOO_MANY_PENDING",
          `Vous avez déjà ${MAX_PENDING_COUNTER_BOOKINGS} réservations à payer au guichet`,
        );
      }
    } else {
      expiresAt = new Date(Math.min(now.getTime() + ONLINE_HOLD, startsAt));
    }

    await releaseExpiredHolds(tx, screening.id, now);

    const totalAmount = seatIds.length * screening.price;
    const [booking] = await tx
      .insert(bookings)
      .values({
        user_id: userId,
        screening_id: screening.id,
        status: "en_attente_paiement",
        total_amount: totalAmount,
        payment_method: input.paymentMethod,
        expires_at: expiresAt,
      })
      .returning({ id: bookings.id });

    try {
      await tx.insert(booking_seats).values(
        seatIds.map((seat_id) => ({
          booking_id: booking!.id,
          screening_id: screening.id,
          seat_id,
        })),
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new AppError(
          "SEATS_TAKEN",
          "Ces sièges viennent d'être réservés. Choisissez-en d'autres.",
        );
      }
      throw e;
    }

    const qrCode = newTicketCode();
    await tx.insert(tickets).values({ booking_id: booking!.id, qr_code: qrCode });

    return { bookingId: booking!.id, qrCode, totalAmount, expiresAt };
  });
}

export type ConfirmResult =
  "confirmed" | "already_confirmed" | "not_found" | "amount_mismatch" | "expired_refund_needed";

// Confirme un paiement en ligne. À appeler UNIQUEMENT côté serveur, après
// vérification du prestataire de paiement (webhook signé) ou en mode simulation.
export async function confirmPayment(
  db: Db,
  input: { bookingId: string; amount: number; reference: string },
  now = new Date(),
): Promise<ConfirmResult> {
  return db.transaction(async (tx) => {
    const [b] = await tx
      .select()
      .from(bookings)
      .where(eq(bookings.id, input.bookingId))
      .for("update");
    if (!b) return "not_found";
    if (b.status === "confirme") return "already_confirmed";
    if (b.total_amount !== input.amount) return "amount_mismatch";
    // Payé après expiration : les sièges ont pu être revendus, il faut rembourser.
    if (b.status === "annule" || (b.expires_at && b.expires_at < now)) {
      return "expired_refund_needed";
    }
    await tx
      .update(bookings)
      .set({ status: "confirme", paid_at: now, payment_reference: input.reference })
      .where(eq(bookings.id, b.id));
    return "confirmed";
  });
}

// Le client abandonne une réservation non payée : les sièges sont libérés.
export async function cancelPendingBooking(
  db: Db,
  userId: string,
  bookingId: string,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const cancelled = await tx
      .update(bookings)
      .set({ status: "annule", cancelled_at: now, cancel_reason: "abandon" })
      .where(
        and(
          eq(bookings.id, bookingId),
          eq(bookings.user_id, userId),
          eq(bookings.status, "en_attente_paiement"),
        ),
      )
      .returning({ id: bookings.id });
    if (!cancelled.length) return false;
    await tx.delete(booking_seats).where(eq(booking_seats.booking_id, bookingId));
    return true;
  });
}

export async function getOwnBooking(db: Db, userId: string, bookingId: string) {
  const [b] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.id, bookingId), eq(bookings.user_id, userId)));
  return b ?? null;
}

export async function listMyTickets(db: Db, userId: string) {
  const rows = await db.query.bookings.findMany({
    where: eq(bookings.user_id, userId),
    orderBy: (b, { desc }) => desc(b.created_at),
    columns: {
      id: true,
      status: true,
      total_amount: true,
      payment_method: true,
      expires_at: true,
    },
    with: {
      ticket: true,
      booking_seats: { with: { seat: { columns: { row_label: true, seat_number: true } } } },
      screening: {
        with: {
          movie: true,
          hall: {
            columns: { id: true, name: true },
            with: { cinema: { columns: { id: true, name: true } } },
          },
        },
      },
    },
  });
  // Même forme qu'avant : un billet et sa réservation.
  return rows
    .filter((b) => b.ticket)
    .map(({ ticket, ...booking }) => ({
      id: ticket!.id,
      qr_code: ticket!.qr_code,
      scanned: ticket!.scanned,
      scanned_at: ticket!.scanned_at,
      created_at: ticket!.created_at,
      booking,
    }));
}
