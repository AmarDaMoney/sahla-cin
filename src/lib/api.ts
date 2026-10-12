import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type AudioLanguage = Database["public"]["Enums"]["audio_language"];
export type PublishStatus = Database["public"]["Enums"]["publish_status"];
export type Movie = Database["public"]["Tables"]["movies"]["Row"];
export type City = Database["public"]["Tables"]["cities"]["Row"];
export type Seat = Database["public"]["Tables"]["seats"]["Row"];

const SCREENING_SELECT =
  "id, starts_at, price, audio_language, status, hall_id, movie_id, movie:movies(*), hall:halls(id, name, type, capacity, cinema:cinemas(id, name, address, latitude, longitude, city_id, city:cities(id, name)))";

export type ScreeningFull = {
  id: string;
  starts_at: string;
  price: number;
  audio_language: AudioLanguage;
  status: PublishStatus;
  hall_id: string;
  movie_id: string;
  movie: Movie;
  hall: {
    id: string;
    name: string;
    type: Database["public"]["Enums"]["hall_type"];
    capacity: number;
    cinema: {
      id: string;
      name: string;
      address: string | null;
      latitude: number | null;
      longitude: number | null;
      city_id: string;
      city: { id: string; name: string } | null;
    };
  };
};

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// Pour les requêtes qui renvoient obligatoirement une ligne ou une liste.
function req<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  const data = unwrap(res);
  if (data == null) throw new Error("Donnée introuvable");
  return data as NonNullable<T>;
}

export async function fetchCities() {
  return req(await supabase.from("cities").select("*").order("name"));
}

export async function fetchCinemas() {
  return req(
    await supabase
      .from("cinemas")
      .select("*, city:cities(id, name), halls(id, name, type, capacity)")
      .order("name"),
  );
}

export async function fetchCinema(id: string) {
  return unwrap(
    await supabase
      .from("cinemas")
      .select("*, city:cities(id, name), halls(id, name, type, capacity)")
      .eq("id", id)
      .maybeSingle(),
  );
}

export async function fetchPublishedScreenings(): Promise<ScreeningFull[]> {
  const nowIso = new Date().toISOString();
  return req(
    await supabase
      .from("screenings")
      .select(SCREENING_SELECT)
      .eq("status", "publie")
      .gte("starts_at", nowIso)
      .order("starts_at"),
  ) as unknown as ScreeningFull[];
}

export async function fetchMovie(id: string) {
  return unwrap(await supabase.from("movies").select("*").eq("id", id).maybeSingle());
}

export async function fetchMovies() {
  return req(await supabase.from("movies").select("*").order("title"));
}

export async function fetchScreening(id: string): Promise<ScreeningFull | null> {
  return unwrap(
    await supabase.from("screenings").select(SCREENING_SELECT).eq("id", id).maybeSingle(),
  ) as unknown as ScreeningFull | null;
}

export async function fetchSeats(hallId: string) {
  return req(
    await supabase
      .from("seats")
      .select("*")
      .eq("hall_id", hallId)
      .order("row_label")
      .order("seat_number"),
  );
}

export async function fetchTakenSeatIds(screeningId: string) {
  const bookings = req(
    await supabase
      .from("bookings")
      .select("id")
      .eq("screening_id", screeningId)
      .neq("status", "annule"),
  );
  if (!bookings.length) return [] as string[];
  const rows = req(
    await supabase
      .from("booking_seats")
      .select("seat_id")
      .in(
        "booking_id",
        bookings.map((b) => b.id),
      ),
  );
  return rows.map((r) => r.seat_id);
}

export async function createBooking(input: {
  screeningId: string;
  seatIds: string[];
  totalAmount: number;
  paid: boolean;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Connexion requise");

  const booking = req(
    await supabase
      .from("bookings")
      .insert({
        screening_id: input.screeningId,
        user_id: userId,
        total_amount: input.totalAmount,
        status: input.paid ? "confirme" : "en_attente_paiement",
      })
      .select("id")
      .single(),
  );

  const seatsRes = await supabase
    .from("booking_seats")
    .insert(input.seatIds.map((seat_id) => ({ booking_id: booking.id, seat_id })));
  if (seatsRes.error) {
    await supabase.from("bookings").update({ status: "annule" }).eq("id", booking.id);
    throw new Error("Ces sièges viennent d'être réservés. Choisissez-en d'autres.");
  }

  const qr = `BCDZ-${booking.id.slice(0, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  req(
    await supabase.from("tickets").insert({ booking_id: booking.id, qr_code: qr }).select("id").single(),
  );
  await supabase.from("bookings").update({ qr_code: qr }).eq("id", booking.id);

  return { bookingId: booking.id, qrCode: qr };
}

export async function fetchMyTickets() {
  return req(
    await supabase
      .from("tickets")
      .select(
        `id, qr_code, scanned, scanned_at, created_at,
         booking:bookings(id, status, total_amount,
           booking_seats(seat:seats(row_label, seat_number)),
           screening:screenings(${SCREENING_SELECT}))`,
      )
      .order("created_at", { ascending: false }),
  );
}

export type ScanOutcome = "ok" | "used" | "invalid";

export async function scanTicket(code: string): Promise<{ outcome: ScanOutcome; info?: string }> {
  type ScanRow = {
    id: string;
    scanned: boolean;
    booking: {
      screening: { movie: { title: string } | null; hall: { name: string } | null } | null;
    } | null;
  };

  const ticket = unwrap(
    await supabase
      .from("tickets")
      .select("id, scanned, booking:bookings(screening:screenings(starts_at, movie:movies(title), hall:halls(name)))")
      .eq("qr_code", code.trim())
      .maybeSingle(),
  ) as unknown as ScanRow | null;

  if (!ticket) return { outcome: "invalid" };
  if (ticket.scanned) return { outcome: "used" };

  const { data: userData } = await supabase.auth.getUser();
  const res = await supabase
    .from("tickets")
    .update({
      scanned: true,
      scanned_at: new Date().toISOString(),
      scanned_by: userData.user?.id ?? null,
    })
    .eq("id", ticket.id)
    .eq("scanned", false)
    .select("id");
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) return { outcome: "used" };

  const screening = ticket.booking?.screening;
  const info = screening?.movie && screening.hall
    ? `${screening.movie.title} — ${screening.hall.name}`
    : null;
  return info ? { outcome: "ok", info } : { outcome: "ok" };
}

/* --- Contributeur / Admin --- */

export async function fetchMyStaffCinemas() {
  return req(
    await supabase.from("cinema_staff").select("cinema:cinemas(id, name, halls(id, name, capacity))"),
  );
}

export async function fetchScreeningsForCinema(cinemaId: string) {
  return req(
    await supabase
      .from("screenings")
      .select(SCREENING_SELECT)
      .order("starts_at", { ascending: true }),
  ).filter(
    (s) => (s as unknown as ScreeningFull).hall.cinema.id === cinemaId,
  ) as unknown as ScreeningFull[];
}

export async function createScreening(input: {
  hallId: string;
  movieId: string;
  startsAt: string;
  price: number;
  audioLanguage: AudioLanguage;
}) {
  const { data: userData } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("screenings")
      .insert({
        hall_id: input.hallId,
        movie_id: input.movieId,
        starts_at: input.startsAt,
        price: input.price,
        audio_language: input.audioLanguage,
        status: "brouillon",
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single(),
  );
}

export async function setScreeningStatus(ids: string[], status: PublishStatus) {
  const res = await supabase.from("screenings").update({ status }).in("id", ids);
  if (res.error) throw new Error(res.error.message);
}

export async function deleteScreening(id: string) {
  const res = await supabase.from("screenings").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
}

export async function fetchScreeningsByStatus(status: PublishStatus) {
  return req(
    await supabase.from("screenings").select(SCREENING_SELECT).eq("status", status).order("starts_at"),
  ) as unknown as ScreeningFull[];
}

export async function upsertMovie(input: {
  id?: string;
  title: string;
  duration_minutes: number;
  genre: string | null;
  synopsis: string | null;
  poster_url: string | null;
  age_rating: string | null;
}) {
  const res: { data: { id: string } | null; error: { message: string } | null } = input.id
    ? await supabase.from("movies").update(input).eq("id", input.id).select("id").single()
    : await supabase.from("movies").insert(input).select("id").single();
  return req(res);
}

export async function assignRole(userId: string, role: AppRole) {
  const res = await supabase.from("user_roles").insert({ user_id: userId, role });
  if (res.error) throw new Error(res.error.message);
}
