import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db/client";
import { media, movies } from "@/server/db/schema";
import { importTmdb, searchTmdb } from "@/server/services/tmdb";
import { createTestDb, createUser } from "./helpers";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const DETAILS = {
  id: 550,
  title: "Spider-Man : Brand New Day",
  original_title: "Spider-Man: Brand New Day",
  original_language: "en",
  overview: "Peter Parker repart de zéro.",
  runtime: 132,
  poster_path: "/poster.jpg",
  genres: [
    { id: 28, name: "Action" },
    { id: 878, name: "Science-Fiction" },
  ],
  videos: {
    results: [
      { site: "YouTube", type: "Teaser", key: "teaser", iso_639_1: "fr" },
      { site: "YouTube", type: "Trailer", key: "en-trailer", iso_639_1: "en" },
      { site: "YouTube", type: "Trailer", key: "fr-trailer", iso_639_1: "fr" },
    ],
  },
  translations: {
    translations: [
      {
        iso_639_1: "ar",
        data: { title: "الرجل العنكبوت: يوم جديد", overview: "يبدأ بيتر من جديد." },
      },
      // Film anglophone : TMDB laisse souvent le titre anglais vide.
      { iso_639_1: "en", data: { title: "", overview: "Peter Parker starts over." } },
    ],
  },
  release_dates: {
    results: [
      { iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] },
      { iso_3166_1: "FR", release_dates: [{ certification: "" }, { certification: "12" }] },
    ],
  },
};

function fakeTmdb() {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.hostname === "image.tmdb.org") return new Response(PNG_1PX);
    if (url.pathname === "/3/search/movie") {
      return Response.json({
        results: [
          {
            id: 550,
            title: DETAILS.title,
            original_title: DETAILS.original_title,
            original_language: "en",
            release_date: "2026-07-31",
            poster_path: "/poster.jpg",
          },
        ],
      });
    }
    if (url.pathname === "/3/movie/550") return Response.json(DETAILS);
    return new Response("not found", { status: 404 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

let db: Db;
let adminId: string;

beforeEach(async () => {
  vi.stubEnv("TMDB_API_KEY", "test-key");
  db = await createTestDb();
  adminId = (await createUser(db, "admin@example.com")).id;
});

describe("TMDB import", () => {
  it("imports titles, synopses, genres, rating, trailer and a local copy of the poster", async () => {
    const { fetchImpl } = fakeTmdb();
    const { movieId, created } = await importTmdb(db, adminId, 550, fetchImpl);
    expect(created).toBe(true);
    const [m] = await db.select().from(movies);
    expect(m).toMatchObject({
      id: movieId,
      tmdb_id: 550,
      title: "Spider-Man : Brand New Day",
      title_ar: "الرجل العنكبوت: يوم جديد",
      title_en: "Spider-Man: Brand New Day",
      original_title: "Spider-Man: Brand New Day",
      original_language: "en",
      synopsis: "Peter Parker repart de zéro.",
      synopsis_ar: "يبدأ بيتر من جديد.",
      synopsis_en: "Peter Parker starts over.",
      duration_minutes: 132,
      genre: "Action, Science-fiction",
      age_rating: "-12",
      trailer_url: "https://www.youtube.com/watch?v=fr-trailer",
    });
    expect(m!.poster_url).toMatch(/^\/api\/media\//);
    expect(await db.select().from(media)).toHaveLength(1);
  });

  it("never imports the same film twice, and search shows it as imported", async () => {
    const { fetchImpl } = fakeTmdb();
    const first = await importTmdb(db, adminId, 550, fetchImpl);
    const second = await importTmdb(db, adminId, 550, fetchImpl);
    expect(second).toEqual({ movieId: first.movieId, created: false });
    expect(await db.select().from(movies)).toHaveLength(1);
    const [result] = await searchTmdb(db, "spider", fetchImpl);
    expect(result).toMatchObject({ tmdbId: 550, year: "2026", movieId: first.movieId });
  });

  it("sends a v4 token as a header and a v3 key in the URL", async () => {
    const { fetchImpl } = fakeTmdb();
    await searchTmdb(db, "x", fetchImpl);
    const [url] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(String(url)).toContain("api_key=test-key");

    vi.stubEnv("TMDB_API_KEY", "eyJhbGciOi.token");
    const second = fakeTmdb();
    await searchTmdb(db, "x", second.fetchImpl);
    const [url2, init] = vi.mocked(second.fetchImpl).mock.calls[0]!;
    expect(String(url2)).not.toContain("api_key");
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer eyJhbGciOi.token",
    });
  });

  it("explains a refused key", async () => {
    const fetchImpl = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(searchTmdb(db, "x", fetchImpl)).rejects.toMatchObject({ code: "TMDB_BAD_KEY" });
    vi.stubEnv("TMDB_API_KEY", "");
    await expect(searchTmdb(db, "x", fetchImpl)).rejects.toMatchObject({
      code: "TMDB_NOT_CONFIGURED",
    });
  });
});
