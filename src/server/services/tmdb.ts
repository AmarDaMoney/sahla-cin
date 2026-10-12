// Import de fiches films depuis The Movie Database (TMDB).
// Clé : TMDB_API_KEY (clé API v3 ou jeton de lecture v4), sur themoviedb.org →
// Paramètres → API. Ce produit utilise l'API TMDB mais n'est ni approuvé ni
// certifié par TMDB (mention obligatoire, affichée dans « À propos »).
import { eq, inArray } from "drizzle-orm";
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

  const d = await tmdbGet<Details>(
    `/movie/${tmdbId}`,
    {
      language: "fr-FR",
      append_to_response: "videos,translations,release_dates",
      include_video_language: "fr,en,null",
    },
    fetchImpl,
  );
  const ar = translation(d, "ar");
  const en = translation(d, "en");
  const englishOriginal = d.original_language === "en";

  const [row] = await db
    .insert(movies)
    .values({
      tmdb_id: d.id,
      title: d.title || d.original_title,
      title_ar: ar.title,
      title_en: en.title ?? (englishOriginal ? d.original_title : null),
      original_title: d.original_title || null,
      original_language: d.original_language || null,
      synopsis: d.overview?.trim() || null,
      synopsis_ar: ar.overview,
      synopsis_en: en.overview,
      duration_minutes: d.runtime && d.runtime > 0 ? Math.min(d.runtime, 600) : 100,
      genre:
        d.genres
          .map((g) => GENRES[g.id] ?? g.name)
          .slice(0, 3)
          .join(", ") || null,
      age_rating: frenchRating(d),
      trailer_url: trailerUrl(d),
      poster_url: await copyPoster(db, userId, d.poster_path, fetchImpl),
    })
    .onConflictDoNothing({ target: movies.tmdb_id })
    .returning({ id: movies.id });

  if (row) return { movieId: row.id, created: true };
  // Importé en parallèle par quelqu'un d'autre.
  const [again] = await db.select({ id: movies.id }).from(movies).where(eq(movies.tmdb_id, tmdbId));
  return { movieId: again!.id, created: false };
}
