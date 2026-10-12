// Contrôle des billets à l'entrée par un agent de guichet.
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookings, cinema_staff, tickets } from "../db/schema";
import { AppError } from "@/lib/errors";
import { hasRole, isAdmin, type Viewer } from "../viewer";

export type ScanOutcome =
  "ok" | "used" | "invalid" | "unpaid" | "cancelled" | "wrong_cinema" | "too_early" | "expired";

export type ScanResult = {
  outcome: ScanOutcome;
  info: string | null;
  amount: number | null;
  scannedAt?: string | null;
};

const EARLY_ENTRY = 3 * 60 * 60_000; // contrôle possible 3 h avant la séance

const algiers = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Algiers",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// collectCash = true : l'agent encaisse une réservation non payée puis valide l'entrée.
export async function scanTicket(
  db: Db,
  viewer: Viewer,
  code: string,
  collectCash = false,
  now = new Date(),
): Promise<ScanResult> {
  const admin = isAdmin(viewer);
  if (!admin && !hasRole(viewer, "agent_guichet")) {
    throw new AppError("NOT_AGENT", "Réservé aux agents de guichet");
  }

  return db.transaction(async (tx) => {
    const ticket = await tx.query.tickets.findFirst({
      where: eq(tickets.qr_code, code.trim().toUpperCase()),
      with: {
        booking: {
          with: {
            screening: {
              with: {
                movie: { columns: { title: true, duration_minutes: true } },
                hall: {
                  columns: { name: true },
                  with: { cinema: { columns: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!ticket) return { outcome: "invalid", info: null, amount: null };

    const { booking } = ticket;
    const { screening } = booking;
    const cinema = screening.hall.cinema;

    if (!admin) {
      const [assigned] = await tx
        .select({ id: cinema_staff.id })
        .from(cinema_staff)
        .where(and(eq(cinema_staff.user_id, viewer.id), eq(cinema_staff.cinema_id, cinema.id)));
      if (!assigned) return { outcome: "wrong_cinema", info: cinema.name, amount: null };
    }

    const label = `${screening.movie.title} — ${screening.hall.name} — ${algiers.format(screening.starts_at)}`;
    const start = screening.starts_at.getTime();
    const end = start + screening.movie.duration_minutes * 60_000;

    if (booking.status === "annule") return { outcome: "cancelled", info: label, amount: null };
    if (ticket.scanned) {
      return {
        outcome: "used",
        info: label,
        amount: null,
        scannedAt: ticket.scanned_at?.toISOString() ?? null,
      };
    }
    if (now.getTime() < start - EARLY_ENTRY)
      return { outcome: "too_early", info: label, amount: null };
    if (now.getTime() > end) return { outcome: "expired", info: label, amount: null };

    if (booking.status === "en_attente_paiement") {
      if (!collectCash) return { outcome: "unpaid", info: label, amount: booking.total_amount };
      await tx
        .update(bookings)
        .set({
          status: "confirme",
          paid_at: now,
          payment_method: "espece",
          payment_reference: `GUICHET-${viewer.id}`,
        })
        .where(and(eq(bookings.id, booking.id), eq(bookings.status, "en_attente_paiement")));
    }

    // Condition scanned = false : deux agents qui scannent en même temps ne
    // peuvent pas valider le même billet deux fois.
    const updated = await tx
      .update(tickets)
      .set({ scanned: true, scanned_at: now, scanned_by: viewer.id })
      .where(and(eq(tickets.id, ticket.id), eq(tickets.scanned, false)))
      .returning({ id: tickets.id });
    if (!updated.length) return { outcome: "used", info: label, amount: null };

    return { outcome: "ok", info: label, amount: null };
  });
}
