// Schéma de la base de données (source de vérité).
//
// Après toute modification : `bun run db:generate` crée la migration SQL dans
// drizzle/, appliquée au déploiement par `bun run db:migrate`.
//
// Conventions :
//  - tables métier : propriétés en snake_case, identiques aux colonnes SQL ;
//  - tables d'authentification (user, session, account, verification,
//    rate_limit) : propriétés en camelCase, imposées par Better Auth.
//
// Les garanties critiques (un siège par séance, montants positifs…) sont des
// contraintes SQL : elles tiennent même si le code applicatif a un bug.
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  customType,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ---------------------------------------------------------------- Enums */

export const appRole = pgEnum("app_role", ["client", "contributeur", "admin", "agent_guichet"]);
export const hallType = pgEnum("hall_type", ["standard", "vip"]);
export const audioLanguage = pgEnum("audio_language", ["VO", "VF", "VOSTFR", "VOSTAR", "AR_DUB"]);
export const publishStatus = pgEnum("publish_status", ["brouillon", "en_revue", "publie"]);
export const bookingStatus = pgEnum("booking_status", [
  "en_attente_paiement",
  "confirme",
  "annule",
]);
export const paymentMethod = pgEnum("payment_method", ["cib", "baridimob", "dahabia", "espece"]);

/* ------------------------------------------------------- Authentification */

export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Limitation du nombre de tentatives (connexion, inscription…), partagée entre
// les instances du serveur.
export const rateLimit = pgTable("rate_limit", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------- Rôles et équipes */

export const user_roles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: appRole("role").notNull(),
    created_at: createdAt(),
  },
  (t) => [unique("user_roles_user_role_key").on(t.user_id, t.role)],
);

/* -------------------------------------------------------- Lieux et salles */

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  name_ar: text("name_ar"),
  name_en: text("name_en"),
  created_at: createdAt(),
});

export const cinemas = pgTable(
  "cinemas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    city_id: uuid("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "restrict" }),
    address: text("address"),
    phone: text("phone"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    description: text("description"),
    logo_url: text("logo_url"),
    created_at: createdAt(),
  },
  (t) => [index("cinemas_city_id_idx").on(t.city_id)],
);

// Agents de guichet et contributeurs rattachés à un cinéma.
export const cinema_staff = pgTable(
  "cinema_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cinema_id: uuid("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "cascade" }),
    created_at: createdAt(),
  },
  (t) => [unique("cinema_staff_user_cinema_key").on(t.user_id, t.cinema_id)],
);

export const halls = pgTable(
  "halls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cinema_id: uuid("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    type: hallType("type").notNull().default("standard"),
    created_at: createdAt(),
  },
  (t) => [
    unique("halls_cinema_name_key").on(t.cinema_id, t.name),
    check("halls_capacity_check", sql`${t.capacity} BETWEEN 1 AND 1000`),
  ],
);

export const seats = pgTable(
  "seats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hall_id: uuid("hall_id")
      .notNull()
      .references(() => halls.id, { onDelete: "cascade" }),
    row_label: text("row_label").notNull(),
    seat_number: integer("seat_number").notNull(),
    seat_type: text("seat_type").notNull().default("standard"),
  },
  (t) => [unique("seats_hall_row_number_key").on(t.hall_id, t.row_label, t.seat_number)],
);

/* --------------------------------------------------- Films et séances */

export const movies = pgTable(
  "movies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Titre et synopsis : français (référence), plus arabe et anglais facultatifs.
    title: text("title").notNull(),
    title_ar: text("title_ar"),
    title_en: text("title_en"),
    poster_url: text("poster_url"),
    trailer_url: text("trailer_url"),
    duration_minutes: integer("duration_minutes").notNull().default(100),
    synopsis: text("synopsis"),
    synopsis_ar: text("synopsis_ar"),
    synopsis_en: text("synopsis_en"),
    genre: text("genre"),
    age_rating: text("age_rating"),
    created_at: createdAt(),
  },
  (t) => [check("movies_duration_check", sql`${t.duration_minutes} BETWEEN 1 AND 600`)],
);

export const screenings = pgTable(
  "screenings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hall_id: uuid("hall_id")
      .notNull()
      .references(() => halls.id, { onDelete: "restrict" }),
    movie_id: uuid("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "restrict" }),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    audio_language: audioLanguage("audio_language").notNull().default("VF"),
    // Prix en dinars (DA), entier.
    price: integer("price").notNull().default(500),
    status: publishStatus("status").notNull().default("brouillon"),
    created_by: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [
    index("screenings_status_starts_idx").on(t.status, t.starts_at),
    index("screenings_hall_id_idx").on(t.hall_id),
    check("screenings_price_check", sql`${t.price} BETWEEN 0 AND 100000`),
  ],
);

/* ------------------------------------------------------------ Billetterie */

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    screening_id: uuid("screening_id")
      .notNull()
      .references(() => screenings.id, { onDelete: "restrict" }),
    status: bookingStatus("status").notNull().default("en_attente_paiement"),
    total_amount: integer("total_amount").notNull(),
    payment_method: paymentMethod("payment_method").notNull(),
    payment_reference: text("payment_reference"),
    paid_at: timestamp("paid_at", { withTimezone: true }),
    // Réservation non payée : les sièges sont libérés après cette date.
    expires_at: timestamp("expires_at", { withTimezone: true }),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    cancel_reason: text("cancel_reason"),
    created_at: createdAt(),
  },
  (t) => [
    index("bookings_user_id_idx").on(t.user_id),
    index("bookings_pending_idx")
      .on(t.screening_id, t.expires_at)
      .where(sql`${t.status} = 'en_attente_paiement'`),
    check("bookings_total_amount_check", sql`${t.total_amount} >= 0`),
  ],
);

export const booking_seats = pgTable(
  "booking_seats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    booking_id: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    screening_id: uuid("screening_id")
      .notNull()
      .references(() => screenings.id, { onDelete: "restrict" }),
    seat_id: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "restrict" }),
  },
  (t) => [
    // LA garantie anti double réservation : un siège, une seule réservation
    // active par séance (les sièges des réservations annulées sont supprimés).
    unique("booking_seats_screening_seat_key").on(t.screening_id, t.seat_id),
  ],
);

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  booking_id: uuid("booking_id")
    .notNull()
    .unique()
    .references(() => bookings.id, { onDelete: "cascade" }),
  qr_code: text("qr_code").notNull().unique(),
  scanned: boolean("scanned").notNull().default(false),
  scanned_at: timestamp("scanned_at", { withTimezone: true }),
  scanned_by: uuid("scanned_by").references(() => user.id, { onDelete: "set null" }),
  created_at: createdAt(),
});

/* ----------------------------------------------------------------- Médias */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// Images envoyées par les administrateurs (affiches). Stockées dans la base :
// sauvegardées avec elle, aucun service de stockage à configurer.
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    content_type: text("content_type").notNull(),
    data: bytea("data").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    uploaded_by: uuid("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    created_at: createdAt(),
  },
  (t) => [
    check(
      "media_content_type_check",
      sql`${t.content_type} IN ('image/jpeg', 'image/png', 'image/webp')`,
    ),
    check("media_size_check", sql`${t.size} BETWEEN 1 AND 3000000`),
  ],
);

/* -------------------------------------------------------------- Relations */

export const userRelations = relations(user, ({ many }) => ({
  roles: many(user_roles),
  staff: many(cinema_staff),
}));

export const userRolesRelations = relations(user_roles, ({ one }) => ({
  user: one(user, { fields: [user_roles.user_id], references: [user.id] }),
}));

export const citiesRelations = relations(cities, ({ many }) => ({
  cinemas: many(cinemas),
}));

export const cinemasRelations = relations(cinemas, ({ one, many }) => ({
  city: one(cities, { fields: [cinemas.city_id], references: [cities.id] }),
  halls: many(halls),
  staff: many(cinema_staff),
}));

export const cinemaStaffRelations = relations(cinema_staff, ({ one }) => ({
  user: one(user, { fields: [cinema_staff.user_id], references: [user.id] }),
  cinema: one(cinemas, { fields: [cinema_staff.cinema_id], references: [cinemas.id] }),
}));

export const hallsRelations = relations(halls, ({ one, many }) => ({
  cinema: one(cinemas, { fields: [halls.cinema_id], references: [cinemas.id] }),
  seats: many(seats),
  screenings: many(screenings),
}));

export const seatsRelations = relations(seats, ({ one }) => ({
  hall: one(halls, { fields: [seats.hall_id], references: [halls.id] }),
}));

export const moviesRelations = relations(movies, ({ many }) => ({
  screenings: many(screenings),
}));

export const screeningsRelations = relations(screenings, ({ one, many }) => ({
  hall: one(halls, { fields: [screenings.hall_id], references: [halls.id] }),
  movie: one(movies, { fields: [screenings.movie_id], references: [movies.id] }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  screening: one(screenings, { fields: [bookings.screening_id], references: [screenings.id] }),
  booking_seats: many(booking_seats),
  ticket: one(tickets),
}));

export const bookingSeatsRelations = relations(booking_seats, ({ one }) => ({
  booking: one(bookings, { fields: [booking_seats.booking_id], references: [bookings.id] }),
  seat: one(seats, { fields: [booking_seats.seat_id], references: [seats.id] }),
}));

export const ticketsRelations = relations(tickets, ({ one }) => ({
  booking: one(bookings, { fields: [tickets.booking_id], references: [bookings.id] }),
}));
