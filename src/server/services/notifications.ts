// E-mail récapitulatif envoyé au client après une réservation.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookings, user } from "../db/schema";
import { actionEmail, sendEmail } from "../email";

const when = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Algiers",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export async function sendBookingEmail(db: Db, bookingId: string) {
  const b = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: {
      ticket: true,
      booking_seats: { with: { seat: true } },
      screening: { with: { movie: true, hall: { with: { cinema: true } } } },
    },
  });
  if (!b?.ticket) return;
  const [owner] = await db.select().from(user).where(eq(user.id, b.user_id));
  if (!owner) return;

  const seats = b.booking_seats.map((s) => `${s.seat.row_label}${s.seat.seat_number}`).join(", ");
  const { screening } = b;
  const paid = b.status === "confirme";
  const intro =
    `${screening.movie.title} — ${screening.hall.cinema.name}, ${screening.hall.name}, ` +
    `${when.format(screening.starts_at)}. Sièges : ${seats}. Total : ${b.total_amount} DA ` +
    (paid ? "(payé)." : "(à régler au guichet au plus tard 15 min avant la séance).") +
    ` Référence : ${b.ticket.qr_code}. Présentez le QR code de votre billet à l'entrée.`;

  await sendEmail(
    actionEmail({
      to: owner.email,
      subject: paid ? "Votre billet BookCinéDZ" : "Votre réservation BookCinéDZ",
      intro,
      action: "Voir mon billet",
      url: `${process.env["BETTER_AUTH_URL"] ?? ""}/tickets`,
    }),
  );
}

// L'e-mail ne doit jamais faire échouer une réservation.
export function notifyBooking(db: Db, bookingId: string) {
  sendBookingEmail(db, bookingId).catch((e) => console.error("[email] récapitulatif", e));
}
