import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db/client";
import { media, movies } from "@/server/db/schema";
import { enrichMovies, importTmdb, normalizeTitle, searchTmdb } from "@/server/services/tmdb";
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

type SearchResult = {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
};

// Recherche TMDB simulée : chaque requête renvoie la liste donnée.
function fakeSearch(byQuery: Record<string, SearchResult[]>) {
  const queries: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === "image.tmdb.org") return new Response(PNG_1PX);
    if (url.pathname === "/3/search/movie") {
      const q = url.searchParams.get("query")!;
      queries.push(q);
      return Response.json({
        results: (byQuery[q] ?? []).map((r) => ({
          original_language: "en",
          poster_path: "/p.jpg",
          ...r,
        })),
      });
    }
    const id = Number(url.pathname.split("/").pop());
    if (id === 550) return Response.json(DETAILS);
    return Response.json({ ...DETAILS, id, title: `Film ${id}`, original_title: `Film ${id}` });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, queries };
}

const NOW = new Date("2026-10-12T12:00:00Z");
const SPIDER = {
  id: 550,
  title: "Spider-Man : Brand New Day",
  original_title: "Spider-Man: Brand New Day",
  release_date: "2026-07-31",
};

async function addMovie(values: Partial<typeof movies.$inferInsert> & { title: string }) {
  const [row] = await db
    .insert(movies)
    .values({ duration_minutes: 90, ...values })
    .returning();
  return row!;
}

describe("Complete existing films from TMDB", () => {
  it("normalizes titles (accents, punctuation, spaces)", () => {
    expect(normalizeTitle("Spider-Man : Brand New Day")).toBe(
      normalizeTitle("spider man brand new day"),
    );
    expect(normalizeTitle("Pat' Patrouille")).toBe("pat patrouille");
    expect(normalizeTitle("Été")).toBe("ete");
  });

  it("fills only the empty fields and never overwrites what was typed", async () => {
    const movie = await addMovie({
      title: "Spider-Man : Brand New Day",
      original_title: "Spider-Man: Brand New Day",
      synopsis: "Mon résumé à moi.",
      duration_minutes: 130,
    });
    const { fetchImpl } = fakeSearch({ "Spider-Man: Brand New Day": [SPIDER] });
    const report = await enrichMovies(db, adminId, { fetchImpl, now: NOW });
    expect(report).toEqual({ updated: ["Spider-Man : Brand New Day"], notFound: [], failed: [] });
    const [m] = await db.select().from(movies);
    expect(m).toMatchObject({
      id: movie.id,
      tmdb_id: 550,
      synopsis: "Mon résumé à moi.",
      duration_minutes: 130,
      synopsis_ar: "يبدأ بيتر من جديد.",
      age_rating: "-12",
      trailer_url: "https://www.youtube.com/watch?v=fr-trailer",
    });
    expect(m!.poster_url).toMatch(/^\/api\/media\//);
  });

  it("replaces everything for demo films", async () => {
    const movie = await addMovie({
      title: "Spider-Man : Brand New Day",
      original_title: "Spider-Man: Brand New Day",
      synopsis: "Texte inventé.",
      poster_url: "https://example.com/old.jpg",
    });
    const { fetchImpl } = fakeSearch({ "Spider-Man: Brand New Day": [SPIDER] });
    await enrichMovies(db, adminId, { fetchImpl, now: NOW, replaceIds: [movie.id] });
    const [m] = await db.select().from(movies);
    expect(m).toMatchObject({ synopsis: "Peter Parker repart de zéro.", duration_minutes: 132 });
    expect(m!.poster_url).toMatch(/^\/api\/media\//);
  });

  it("only accepts an identical title and prefers the recent film of that name", async () => {
    await addMovie({ title: "Vaiana", original_title: "Moana" });
    await addMovie({ title: "Marius et le royaume des mers" });
    const { fetchImpl } = fakeSearch({
      Moana: [
        { id: 277834, title: "Vaiana", original_title: "Moana", release_date: "2016-11-23" },
        { id: 1241982, title: "Vaiana", original_title: "Moana", release_date: "2026-07-08" },
      ],
      "Marius et le royaume des mers": [
        { id: 9, title: "Marius", original_title: "Marius", release_date: "2026-01-01" },
      ],
    });
    const report = await enrichMovies(db, adminId, { fetchImpl, now: NOW });
    expect(report.notFound).toEqual(["Marius et le royaume des mers"]);
    const rows = await db.select().from(movies);
    expect(rows.find((r) => r.original_title === "Moana")!.tmdb_id).toBe(1241982);
    expect(rows.find((r) => r.title.startsWith("Marius"))!.tmdb_id).toBeNull();
  });

  it("does not guess between several old films with the same title", async () => {
    await addMovie({ title: "Hamlet" });
    const { fetchImpl } = fakeSearch({
      Hamlet: [
        { id: 1, title: "Hamlet", original_title: "Hamlet", release_date: "1948-05-04" },
        { id: 2, title: "Hamlet", original_title: "Hamlet", release_date: "1996-12-25" },
      ],
    });
    expect((await enrichMovies(db, adminId, { fetchImpl, now: NOW })).notFound).toEqual(["Hamlet"]);
  });

  it("skips a film already linked to another entry, and films already linked", async () => {
    await addMovie({ title: "Spider-Man", tmdb_id: 550 });
    await addMovie({
      title: "Spider-Man : Brand New Day",
      original_title: "Spider-Man: Brand New Day",
    });
    const { fetchImpl, queries } = fakeSearch({ "Spider-Man: Brand New Day": [SPIDER] });
    const report = await enrichMovies(db, adminId, { fetchImpl, now: NOW });
    expect(report.notFound).toEqual(["Spider-Man : Brand New Day"]);
    expect(queries).not.toContain("Spider-Man");
  });

  it("stops on a refused key", async () => {
    await addMovie({ title: "X" });
    const fetchImpl = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(enrichMovies(db, adminId, { fetchImpl, now: NOW })).rejects.toMatchObject({
      code: "TMDB_BAD_KEY",
    });
  });
});
