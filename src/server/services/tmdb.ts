// Import de fiches films depuis The Movie Database (TMDB).
// Clé : TMDB_API_KEY (clé API v3 ou jeton de lecture v4), sur themoviedb.org →
// Paramètres → API. Ce produit utilise l'API TMDB mais n'est ni approuvé ni
// certifié par TMDB (mention obligatoire, affichée dans « À propos »).
import { and, eq, inArray, isNull } from "drizzle-orm";
import { AppError } from "@/lib/errors";
import { envValue } from "../config";
import type { Db } from "../db/client";
import { movies } from "../db/schema";
import { saveImage } from "./media";

const API = "https://api.themoviedb.org/3";
const IMAGES = "https://image.tmdb.org/t/p";

type Fetch = typeof fetch;

export const tmdbConfigured = () => !!envValue("TMDB_API_KEY");

async function tmdbGet<T>(
  path: string,
  params: Record<string, string>,
  fetchImpl: Fetch,
): Promise<T> {
  const key = envValue("TMDB_API_KEY");
  if (!key) throw new AppError("TMDB_NOT_CONFIGURED", "TMDB_API_KEY manquant");
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { accept: "application/json" };
  // Jeton v4 (JWT) dans l'en-tête, clé v3 dans l'adresse.
  if (key.startsWith("eyJ")) headers["authorization"] = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  const res = await fetchImpl(url, { headers });
  if (res.status === 401) throw new AppError("TMDB_BAD_KEY", "Clé TMDB refusée");
  if (!res.ok) throw new AppError("TMDB_UNAVAILABLE", `TMDB indisponible (${res.status})`);
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------- Recherche */

type SearchResponse = {
  results: Array<{
    id: number;
    title: string;
    original_title: string;
    original_language: string;
    release_date?: string;
    poster_path: string | null;
  }>;
};

export async function searchTmdb(db: Db, query: string, fetchImpl: Fetch = fetch) {
  const data = await tmdbGet<SearchResponse>(
    "/search/movie",
    { query, language: "fr-FR", include_adult: "false" },
    fetchImpl,
  );
  const results = data.results.slice(0, 12);
  const ids = results.map((r) => r.id);
  const existing = ids.length
    ? await db
        .select({ id: movies.id, tmdb_id: movies.tmdb_id })
        .from(movies)
        .where(inArray(movies.tmdb_id, ids))
    : [];
  return results.map((r) => ({
    tmdbId: r.id,
    title: r.title,
    originalTitle: r.original_title,
    year: r.release_date?.slice(0, 4) || null,
    thumbnail: r.poster_path ? `${IMAGES}/w92${r.poster_path}` : null,
    movieId: existing.find((e) => e.tmdb_id === r.id)?.id ?? null,
  }));
}

/* ------------------------------------------------------------------ Import */

type Details = {
  id: number;
  title: string;
  original_title: string;
  original_language: string;
  overview: string;
  runtime: number | null;
  poster_path: string | null;
  genres: Array<{ id: number; name: string }>;
  videos?: { results: Array<{ site: string; type: string; key: string; iso_639_1: string }> };
  translations?: {
    translations: Array<{ iso_639_1: string; data: { title?: string; overview?: string } }>;
  };
  release_dates?: {
    results: Array<{ iso_3166_1: string; release_dates: Array<{ certification: string }> }>;
  };
};

// Genres TMDB → libellés français de l'application (traduits à l'affichage).
const GENRES: Record<number, string> = {
  28: "Action",
  12: "Aventure",
  16: "Animation",
  35: "Comédie",
  80: "Policier",
  99: "Documentaire",
  18: "Drame",
  10751: "Famille",
  14: "Fantastique",
  36: "Histoire",
  27: "Horreur",
  10402: "Musique",
  9648: "Mystère",
  10749: "Romance",
  878: "Science-fiction",
  10770: "Téléfilm",
  53: "Thriller",
  10752: "Guerre",
  37: "Western",
};

// Classification française (CNC) → libellé de l'application.
function frenchRating(details: Details): string | null {
  const fr = details.release_dates?.results.find((r) => r.iso_3166_1 === "FR");
  const cert = fr?.release_dates.map((d) => d.certification.trim()).find(Boolean);
  if (!cert) return null;
  if (cert === "U" || cert === "TP") return "Tous publics";
  const age = cert.match(/\d+/)?.[0];
  return age ? `-${age}` : null;
}

function translation(details: Details, lang: string) {
  const all = details.translations?.translations.filter((t) => t.iso_639_1 === lang) ?? [];
  const title = all.map((t) => t.data.title?.trim()).find(Boolean) ?? null;
  const overview = all.map((t) => t.data.overview?.trim()).find(Boolean) ?? null;
  return { title, overview };
}

function trailerUrl(details: Details): string | null {
  const videos = (details.videos?.results ?? []).filter(
    (v) => v.site === "YouTube" && v.type === "Trailer",
  );
  // Bande-annonce française de préférence, puis anglaise, puis n'importe laquelle.
  const pick =
    videos.find((v) => v.iso_639_1 === "fr") ??
    videos.find((v) => v.iso_639_1 === "en") ??
    videos[0];
  return pick ? `https://www.youtube.com/watch?v=${pick.key}` : null;
}

async function copyPoster(db: Db, userId: string, path: string | null, fetchImpl: Fetch) {
  if (!path) return null;
  try {
    const res = await fetchImpl(`${IMAGES}/w500${path}`);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return (await saveImage(db, userId, bytes.toString("base64"))).url;
  } catch (e) {
    console.error("[tmdb] affiche", e);
    return null;
  }
}

function fetchDetails(tmdbId: number, fetchImpl: Fetch) {
  return tmdbGet<Details>(
    `/movie/${tmdbId}`,
    {
      language: "fr-FR",
      append_to_response: "videos,translations,release_dates",
      include_video_language: "fr,en,null",
    },
    fetchImpl,
  );
}

// Champs de la fiche tirés de TMDB (sans l'affiche, copiée à part).
function detailsToValues(d: Details) {
  const ar = translation(d, "ar");
  const en = translation(d, "en");
  const englishOriginal = d.original_language === "en";
  return {
    title: d.title || d.original_title,
    title_ar: ar.title,
    title_en: en.title ?? (englishOriginal ? d.original_title : null),
    original_title: d.original_title || null,
    original_language: d.original_language || null,
    synopsis: d.overview?.trim() || null,
    synopsis_ar: ar.overview,
    synopsis_en: en.overview,
    // 0 ou absent pour les films pas encore sortis.
    duration_minutes: d.runtime && d.runtime > 0 ? Math.min(d.runtime, 600) : null,
    genre:
      d.genres
        .map((g) => GENRES[g.id] ?? g.name)
        .slice(0, 3)
        .join(", ") || null,
    age_rating: frenchRating(d),
    trailer_url: trailerUrl(d),
  };
}

// Crée la fiche du film (ou renvoie celle déjà importée) et retourne son id.
export async function importTmdb(
  db: Db,
  userId: string,
  tmdbId: number,
  fetchImpl: Fetch = fetch,
): Promise<{ movieId: string; created: boolean }> {
  const [existing] = await db
    .select({ id: movies.id })
    .from(movies)
    .where(eq(movies.tmdb_id, tmdbId));
  if (existing) return { movieId: existing.id, created: false };

  const d = await fetchDetails(tmdbId, fetchImpl);
  const values = detailsToValues(d);
  const [row] = await db
    .insert(movies)
    .values({
      ...values,
      tmdb_id: d.id,
      duration_minutes: values.duration_minutes ?? 100,
      poster_url: await copyPoster(db, userId, d.poster_path, fetchImpl),
    })
    .onConflictDoNothing({ target: movies.tmdb_id })
    .returning({ id: movies.id });

  if (row) return { movieId: row.id, created: true };
  // Importé en parallèle par quelqu'un d'autre.
  const [again] = await db.select({ id: movies.id }).from(movies).where(eq(movies.tmdb_id, tmdbId));
  return { movieId: again!.id, created: false };
}

/* -------------------------------------------- Compléter les fiches existantes */

// « Spider-Man : Brand New Day » et « spider man brand new day » sont le même titre.
export function normalizeTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const YEAR = 365 * 24 * 60 * 60_000;

// Ne retient un film TMDB que si son titre correspond exactement. Plusieurs
// films du même titre (« Moana » 2016 et 2026) : le plus récent sorti dans
// les deux dernières années, sinon on ne devine pas.
async function findMatch(titles: string[], fetchImpl: Fetch, now: Date) {
  const wanted = new Set(titles.map(normalizeTitle).filter(Boolean));
  for (const query of titles) {
    const data = await tmdbGet<SearchResponse>(
      "/search/movie",
      { query, language: "fr-FR", include_adult: "false" },
      fetchImpl,
    );
    const exact = data.results.filter(
      (r) => wanted.has(normalizeTitle(r.title)) || wanted.has(normalizeTitle(r.original_title)),
    );
    const recent = exact
      .filter((r) => r.release_date && Date.parse(r.release_date) >= now.getTime() - 2 * YEAR)
      .sort((a, b) => b.release_date!.localeCompare(a.release_date!));
    if (recent[0]) return recent[0].id;
    if (exact.length === 1) return exact[0]!.id;
  }
  return null;
}

export type EnrichReport = { updated: string[]; notFound: string[]; failed: string[] };

// Relie à TMDB les films saisis à la main (ou de démonstration) et complète
// les champs vides : affiche, traductions, durée, genres, classification,
// bande-annonce. Ce qui a été saisi n'est jamais écrasé, sauf pour les ids
// de `replaceIds` (films de démonstration, au texte inventé).
export async function enrichMovies(
  db: Db,
  userId: string,
  {
    fetchImpl = fetch,
    now = new Date(),
    replaceIds = [] as readonly string[],
  }: { fetchImpl?: Fetch; now?: Date; replaceIds?: readonly string[] } = {},
): Promise<EnrichReport> {
  const report: EnrichReport = { updated: [], notFound: [], failed: [] };
  const list = await db.select().from(movies).where(isNull(movies.tmdb_id)).orderBy(movies.title);

  for (const movie of list) {
    const titles = [
      ...new Set(
        [movie.original_title, movie.title_en, movie.title].filter((t): t is string => !!t),
      ),
    ];
    let tmdbId: number | null;
    try {
      tmdbId = await findMatch(titles, fetchImpl, now);
    } catch (e) {
      // Clé refusée : inutile de continuer, l'administrateur doit corriger.
      if (e instanceof AppError && e.code === "TMDB_BAD_KEY") throw e;
      console.error("[tmdb] recherche", movie.title, e);
      report.failed.push(movie.title);
      continue;
    }
    if (tmdbId === null) {
      report.notFound.push(movie.title);
      continue;
    }
    // Déjà relié à une autre fiche (doublon) : on n'y touche pas.
    const [taken] = await db
      .select({ id: movies.id })
      .from(movies)
      .where(eq(movies.tmdb_id, tmdbId));
    if (taken) {
      report.notFound.push(movie.title);
      continue;
    }

    try {
      const d = await fetchDetails(tmdbId, fetchImpl);
      const replace = replaceIds.includes(movie.id);
      const fresh = detailsToValues(d);
      const set: Partial<typeof movies.$inferInsert> = { tmdb_id: d.id };
      for (const [key, value] of Object.entries(fresh) as Array<
        [keyof typeof fresh, string | number | null]
      >) {
        if (value === null || value === "") continue;
        const current = movie[key];
        const empty = current === null || current === "";
        if (replace || empty) Object.assign(set, { [key]: value });
      }
      if (replace || !movie.poster_url) {
        const poster = await copyPoster(db, userId, d.poster_path, fetchImpl);
        if (poster) set.poster_url = poster;
      }
      const done = await db
        .update(movies)
        .set(set)
        .where(and(eq(movies.id, movie.id), isNull(movies.tmdb_id)))
        .returning({ id: movies.id })
        .catch((e: unknown) => {
          // Relié en parallèle (contrainte d'unicité sur tmdb_id).
          console.error("[tmdb] mise à jour", movie.title, e);
          return [];
        });
      (done.length ? report.updated : report.failed).push(set.title ?? movie.title);
    } catch (e) {
      if (e instanceof AppError && e.code === "TMDB_BAD_KEY") throw e;
      console.error("[tmdb] fiche", movie.title, e);
      report.failed.push(movie.title);
    }
  }
  return report;
}
