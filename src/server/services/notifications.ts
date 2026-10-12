// E-mail récapitulatif envoyé au client après une réservation.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { bookings, user } from "../db/schema";
import { appUrl } from "../config";
import { DEFAULT_LANG, formatDate, localized, type Lang } from "@/lib/i18n/lang";
import { actionEmail, sendEmail } from "../email";
import { EMAIL_TEXTS } from "../email-texts";

export async function sendBookingEmail(db: Db, bookingId: string, lang: Lang = DEFAULT_LANG) {
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

  const t = EMAIL_TEXTS[lang].booking;
  const seats = b.booking_seats.map((s) => `${s.seat.row_label}${s.seat.seat_number}`).join(", ");
  const { screening } = b;
  const paid = b.status === "confirme";
  const intro =
    `${localized(screening.movie, "title", lang)} — ${screening.hall.cinema.name}, ` +
    `${screening.hall.name}, ${formatDate(lang, screening.starts_at, "full")}. ` +
    `${t.seats} : ${seats}. ${t.total} : ${b.total_amount} ${t.currency} ` +
    `(${paid ? t.paid : t.pending}). ${t.reference} : ${b.ticket.qr_code}. ${t.show}`;

  await sendEmail(
    actionEmail({
      to: owner.email,
      subject: paid ? t.subjectPaid : t.subjectPending,
      intro,
      action: t.action,
      url: `${appUrl() ?? ""}/tickets`,
      lang,
    }),
  );
}

// L'e-mail ne doit jamais faire échouer une réservation.
export function notifyBooking(db: Db, bookingId: string, lang: Lang = DEFAULT_LANG) {
  sendBookingEmail(db, bookingId, lang).catch((e) => console.error("[email] récapitulatif", e));
}
