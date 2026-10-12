// API de l'application : fonctions serveur appelées par les pages.
// Le code des handlers ne s'exécute que sur le serveur ; le navigateur n'a
// jamais accès direct à la base de données.
//
// Règles :
//  - chaque entrée est validée avec zod ;
//  - toute donnée privée passe par requireUser / requireRole ;
//  - la logique métier vit dans src/server/services (testée dans tests/).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireRole, requireUser, withViewer } from "@/lib/middleware";
import type { PaymentStart } from "@/lib/payments";
import { AppError } from "@/lib/errors";
import { serialize, type Serialized } from "@/server/serialize";
import * as admin from "@/server/services/admin";
import * as booking from "@/server/services/booking";
import * as catalog from "@/server/services/catalog";
import { notifyBooking } from "@/server/services/notifications";
import * as programme from "@/server/services/programme";
import { scanTicket as scan } from "@/server/services/scan";
import type { AppRole as Role } from "@/server/viewer";

export type AppRole = Role;
export type AudioLanguage = "VO" | "VF" | "VOSTFR" | "VOSTAR" | "AR_DUB";
export type PublishStatus = "brouillon" | "en_revue" | "publie";
export type ScreeningFull = Serialized<catalog.ScreeningFull>;
export type Movie = ScreeningFull["movie"];
export type { ScanOutcome, ScanResult } from "@/server/services/scan";

const id = z.string().uuid();
const audioLanguage = z.enum(["VO", "VF", "VOSTFR", "VOSTAR", "AR_DUB"]);
const publishStatus = z.enum(["brouillon", "en_revue", "publie"]);
const appRole = z.enum(["client", "contributeur", "admin", "agent_guichet"]);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const httpUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((v) => /^https?:\/\//.test(v), "URL http(s) attendue")
  .nullable()
  .or(z.literal("").transform(() => null));

/* ------------------------------------------------------------ Session */

export const getMe = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .handler(async ({ context }) => context.viewer);

// Options de connexion disponibles (Google seulement si configuré).
export const fetchAuthOptions = createServerFn({ method: "GET" }).handler(async () => ({
  google: !!(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]),
}));

/* ------------------------------------------------------------ Catalogue */

export const fetchCities = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .handler(async ({ context }) => serialize(await catalog.listCities(context.db)));

export const fetchCinemas = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .handler(async ({ context }) => serialize(await catalog.listCinemas(context.db)));

export const fetchCinema = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .inputValidator(id)
  .handler(async ({ data, context }) => serialize(await catalog.getCinema(context.db, data)));

export const fetchMovies = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .handler(async ({ context }) => serialize(await catalog.listMovies(context.db)));

export const fetchMovie = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .inputValidator(id)
  .handler(async ({ data, context }) => serialize(await catalog.getMovie(context.db, data)));

export const fetchPublishedScreenings = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .handler(async ({ context }) => serialize(await catalog.listPublishedScreenings(context.db)));

export const fetchScreening = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .inputValidator(id)
  .handler(async ({ data, context }) =>
    serialize(await catalog.getScreening(context.db, context.viewer, data)),
  );

export const fetchSeats = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .inputValidator(id)
  .handler(async ({ data, context }) => serialize(await catalog.listSeats(context.db, data)));

export const fetchTakenSeatIds = createServerFn({ method: "GET" })
  .middleware([withViewer])
  .inputValidator(id)
  .handler(async ({ data, context }) => catalog.takenSeatIds(context.db, data));

/* ---------------------------------------------------------- Réservation */

const paymentMethodId = z.enum(["cib", "baridimob", "dahabia", "espece"]);

export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(
    z.object({
      screeningId: id,
      seatIds: z.array(id).min(1).max(booking.MAX_SEATS_PER_BOOKING),
      paymentMethod: paymentMethodId,
    }),
  )
  .handler(async ({ data, context }) => {
    const result = await booking.bookSeats(context.db, context.viewer.id, data);
    // Paiement en ligne : l'e-mail part après confirmation du paiement.
    if (data.paymentMethod === "espece") notifyBooking(context.db, result.bookingId);
    return serialize(result);
  });

export const cancelPendingBooking = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(id)
  .handler(async ({ data, context }) =>
    booking.cancelPendingBooking(context.db, context.viewer.id, data),
  );

// Lance le paiement en ligne d'une réservation du client connecté.
//
// PAYMENT_MODE=simulation : paiement accepté immédiatement (démo, tests).
// Sans PAYMENT_MODE : paiement en ligne désactivé, seul le guichet fonctionne.
//
// Prestataire réel (SATIM / CIB-Edahabia via une banque, Chargily Pay, Slick
// Pay…) : créer ici la session de paiement et renvoyer { status: "redirect",
// url }, puis appeler booking.confirmPayment depuis une route webhook qui
// vérifie la signature du prestataire (voir README).
export const startOnlinePayment = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .inputValidator(id)
  .handler(async ({ data, context }): Promise<PaymentStart> => {
    const b = await booking.getOwnBooking(context.db, context.viewer.id, data);
    if (!b) throw new AppError("NOT_FOUND", "Réservation introuvable");
    if (b.status === "confirme") return { status: "confirmed" };
    if (b.status !== "en_attente_paiement" || b.payment_method === "espece") {
      throw new AppError("NOT_PAYABLE", "Cette réservation ne peut pas être payée en ligne");
    }
    if (process.env["PAYMENT_MODE"] !== "simulation") {
      throw new AppError(
        "PAYMENT_UNAVAILABLE",
        "Le paiement en ligne n'est pas encore disponible. Choisissez « Paiement au guichet ».",
      );
    }
    const result = await booking.confirmPayment(context.db, {
      bookingId: b.id,
      amount: b.total_amount,
      reference: `SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    });
    if (result !== "confirmed" && result !== "already_confirmed") {
      throw new AppError("PAYMENT_REFUSED", "Paiement refusé : la réservation a expiré");
    }
    if (result === "confirmed") notifyBooking(context.db, b.id);
    return { status: "confirmed" };
  });

export const fetchMyTickets = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) =>
    serialize(await booking.listMyTickets(context.db, context.viewer.id)),
  );

/* ------------------------------------------------------- Contrôle billets */

export const scanTicket = createServerFn({ method: "POST" })
  .middleware([requireRole("agent_guichet", "admin")])
  .inputValidator(z.object({ code: z.string().trim().min(1).max(64), collectCash: z.boolean() }))
  .handler(async ({ data, context }) =>
    scan(context.db, context.viewer, data.code, data.collectCash),
  );

/* ----------------------------------------------------------- Programme */

export const fetchMyStaffCinemas = createServerFn({ method: "GET" })
  .middleware([requireRole("contributeur", "admin")])
  .handler(async ({ context }) =>
    serialize(await programme.listManagedCinemas(context.db, context.viewer)),
  );

export const fetchScreeningsForCinema = createServerFn({ method: "GET" })
  .middleware([requireRole("contributeur", "admin")])
  .inputValidator(id)
  .handler(async ({ data, context }) =>
    serialize(await programme.listCinemaScreenings(context.db, context.viewer, data)),
  );

export const createScreening = createServerFn({ method: "POST" })
  .middleware([requireRole("contributeur", "admin")])
  .inputValidator(
    z.object({
      hallId: id,
      movieId: id,
      startsAtLocal: z.string().max(16),
      price: z.number().int().min(0).max(100_000),
      audioLanguage,
    }),
  )
  .handler(async ({ data, context }) =>
    programme.createScreening(context.db, context.viewer, data),
  );

export const setScreeningStatus = createServerFn({ method: "POST" })
  .middleware([requireRole("contributeur", "admin")])
  .inputValidator(z.object({ ids: z.array(id).max(500), status: publishStatus }))
  .handler(async ({ data, context }) =>
    programme.setScreeningStatus(context.db, context.viewer, data.ids, data.status),
  );

export const deleteScreening = createServerFn({ method: "POST" })
  .middleware([requireRole("contributeur", "admin")])
  .inputValidator(id)
  .handler(async ({ data, context }) =>
    programme.deleteScreening(context.db, context.viewer, data),
  );

/* ------------------------------------------------------- Administration */

const adminOnly = requireRole("admin");

export const fetchScreeningsByStatus = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .inputValidator(publishStatus)
  .handler(async ({ data, context }) =>
    serialize(await admin.listScreeningsByStatus(context.db, data)),
  );

export const upsertMovie = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator(
    z.object({
      id: id.optional(),
      title: z.string().trim().min(1).max(200),
      title_ar: optionalText(200),
      duration_minutes: z.number().int().min(1).max(600),
      genre: optionalText(100),
      synopsis: optionalText(4000),
      poster_url: httpUrl,
      trailer_url: httpUrl,
      age_rating: optionalText(40),
    }),
  )
  .handler(async ({ data, context }) => admin.upsertMovie(context.db, data));

export const createCity = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator(z.string().trim().min(1).max(100))
  .handler(async ({ data, context }) => admin.createCity(context.db, data));

export const createCinema = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator(
    z.object({
      name: z.string().trim().min(1).max(200),
      city_id: id,
      address: optionalText(300),
      phone: optionalText(40),
      latitude: z.number().min(-90).max(90).nullable(),
      longitude: z.number().min(-180).max(180).nullable(),
      description: optionalText(2000),
    }),
  )
  .handler(async ({ data, context }) => admin.createCinema(context.db, data));

export const createHall = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator(
    z.object({
      cinema_id: id,
      name: z.string().trim().min(1).max(100),
      capacity: z.number().int().min(1).max(260),
      type: z.enum(["standard", "vip"]),
    }),
  )
  .handler(async ({ data, context }) => admin.createHall(context.db, data));

export const fetchTeam = createServerFn({ method: "GET" })
  .middleware([adminOnly])
  .handler(async ({ context }) => admin.listTeam(context.db));

export const assignRole = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator(
    z.object({ email: z.string().trim().email().max(320), role: appRole, cinemaId: id.optional() }),
  )
  .handler(async ({ data, context }) => admin.grantRole(context.db, data));

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator(z.object({ userId: id, role: appRole }))
  .handler(async ({ data, context }) => {
    if (data.userId === context.viewer.id && data.role === "admin") {
      throw new AppError("FORBIDDEN", "Vous ne pouvez pas retirer votre propre rôle admin");
    }
    return admin.revokeRole(context.db, data);
  });

export const removeStaff = createServerFn({ method: "POST" })
  .middleware([adminOnly])
  .inputValidator(z.object({ userId: id, cinemaId: id }))
  .handler(async ({ data, context }) => admin.removeStaff(context.db, data));
