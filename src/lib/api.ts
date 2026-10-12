import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { PaymentMethodId } from "@/lib/payments";

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

// Les fonctions SQL renvoient un code (ex. SEATS_TAKEN) et un message lisible
// dans « hint ».
function rpcError(error: { message: string; hint?: string | null }) {
  return new Error(error.hint || error.message);
}

export async function fetchTakenSeatIds(screeningId: string) {
  const { data, error } = await supabase.rpc("get_taken_seats", { _screening_id: screeningId });
  if (error) throw rpcError(error);
  return data ?? [];
}

// Réservation atomique côté serveur : prix, statut et QR code sont fixés par
// la base. La réservation reste « en_attente_paiement » jusqu'au paiement.
export async function createBooking(input: {
  screeningId: string;
  seatIds: string[];
  paymentMethod: PaymentMethodId;
}) {
  const { data, error } = await supabase.rpc("book_seats", {
    _screening_id: input.screeningId,
    _seat_ids: input.seatIds,
    _payment_method: input.paymentMethod,
  });
  if (error) throw rpcError(error);
  const row = data?.[0];
  if (!row) throw new Error("Réservation impossible");
  return {
    bookingId: row.booking_id,
    qrCode: row.qr_code,
    totalAmount: row.total_amount,
    expiresAt: row.expires_at,
  };
}

export async function cancelPendingBooking(bookingId: string) {
  const { error } = await supabase.rpc("cancel_pending_booking", { _booking_id: bookingId });
  if (error) throw rpcError(error);
}

export async function fetchMyTickets() {
  return req(
    await supabase
      .from("tickets")
      .select(
        `id, qr_code, scanned, scanned_at, created_at,
         booking:bookings(id, status, total_amount, payment_method, expires_at,
           booking_seats(seat:seats(row_label, seat_number)),
           screening:screenings(${SCREENING_SELECT}))`,
      )
      .order("created_at", { ascending: false }),
  );
}

export type ScanOutcome =
  "ok" | "used" | "invalid" | "unpaid" | "cancelled" | "wrong_cinema" | "too_early" | "expired";

export type ScanResult = { outcome: ScanOutcome; info: string | null; amount: number | null };

// Contrôle côté serveur : paiement, annulation, cinéma de l'agent et horaire.
// collectCash = true : l'agent encaisse une réservation « paiement au guichet ».
export async function scanTicket(code: string, collectCash = false): Promise<ScanResult> {
  const { data, error } = await supabase.rpc("scan_ticket", {
    _code: code.trim(),
    _collect_cash: collectCash,
  });
  if (error) throw rpcError(error);
  const row = data?.[0];
  if (!row) return { outcome: "invalid", info: null, amount: null };
  return { outcome: row.outcome as ScanOutcome, info: row.info, amount: row.amount };
}

/* --- Contributeur / Admin --- */

export async function fetchMyStaffCinemas() {
  return req(
    await supabase
      .from("cinema_staff")
      .select("cinema:cinemas(id, name, halls(id, name, capacity))"),
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
    await supabase
      .from("screenings")
      .select(SCREENING_SELECT)
      .eq("status", status)
      .order("starts_at"),
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
