import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { cinema_staff, screenings } from "@/server/db/schema";
import { importProgrammeCsv, parseCsv } from "@/server/services/csv-import";
import { copyWeek, createScreening, createScreeningBatch } from "@/server/services/programme";
import { createTestDb, createUser, seedVenue, viewerOf } from "./helpers";

let db: Db;
let venue: Awaited<ReturnType<typeof seedVenue>>;
let contributor: ReturnType<typeof viewerOf>;

// Dates fixes dans le futur ; « maintenant » = 1er novembre 2026.
const NOW = new Date("2026-11-01T08:00:00Z");

beforeEach(async () => {
  db = await createTestDb();
  venue = await seedVenue(db); // film « Poupiya », 90 min
  const u = await createUser(db, "contrib@example.com");
  await db.insert(cinema_staff).values({ user_id: u.id, cinema_id: venue.cinemaA.id });
  contributor = viewerOf(u, ["contributeur"]);
});

const base = () => ({
  hallId: venue.hallA.id,
  movieId: venue.movie.id,
  price: 500,
  audioLanguage: "VF" as const,
});

describe("overlap check", () => {
  it("refuses a showing that overlaps another in the same screen (film + 15 min cleaning)", async () => {
    await createScreening(db, contributor, { ...base(), startsAtLocal: "2026-11-05T14:00" }, NOW);
    // 14:00 + 90 min + 15 min = 15:45
    await expect(
      createScreening(db, contributor, { ...base(), startsAtLocal: "2026-11-05T15:30" }, NOW),
    ).rejects.toMatchObject({ code: "OVERLAP" });
    await createScreening(db, contributor, { ...base(), startsAtLocal: "2026-11-05T15:45" }, NOW);
    // Une autre salle à la même heure : aucun problème.
    await expect(
      createScreening(
        db,
        viewerOf(await createUser(db, "admin@example.com"), ["admin"]),
        { ...base(), hallId: venue.hallB.id, startsAtLocal: "2026-11-05T14:00" },
        NOW,
      ),
    ).resolves.toBeTruthy();
  });
});

describe("batch", () => {
  it("creates one draft per day and time", async () => {
    const res = await createScreeningBatch(
      db,
      contributor,
      {
        ...base(),
        dates: ["2026-11-05", "2026-11-06", "2026-11-07"],
        times: ["20:00", "14:00", "17:00"],
      },
      NOW,
    );
    expect(res).toMatchObject({ created: 9, errors: [] });
    const rows = await db.select().from(screenings);
    expect(rows.every((r) => r.status === "brouillon")).toBe(true);
  });

  it("is all-or-nothing and reports the clashing line", async () => {
    const res = await createScreeningBatch(
      db,
      contributor,
      { ...base(), dates: ["2026-11-05"], times: ["14:00", "15:00"] },
      NOW,
    );
    expect(res.created).toBe(0);
    expect(res.errors).toEqual([{ line: 2, code: "OVERLAP" }]);
    expect(await db.select().from(screenings)).toHaveLength(0);
  });

  it("refuses a screen of another cinema", async () => {
    const res = await createScreeningBatch(
      db,
      contributor,
      { ...base(), hallId: venue.hallB.id, dates: ["2026-11-05"], times: ["14:00"] },
      NOW,
    );
    expect(res.errors).toEqual([{ line: 1, code: "NOT_YOUR_CINEMA" }]);
  });
});

describe("copy a week", () => {
  it("copies 7 days to the following week as drafts and skips clashes", async () => {
    await createScreeningBatch(
      db,
      contributor,
      { ...base(), dates: ["2026-11-02", "2026-11-04"], times: ["14:00", "20:00"] },
      NOW,
    );
    // Déjà une séance la semaine suivante à 20:00 le 11 : celle-là sera ignorée.
    await createScreening(db, contributor, { ...base(), startsAtLocal: "2026-11-11T19:30" }, NOW);
    const res = await copyWeek(
      db,
      contributor,
      { cinemaId: venue.cinemaA.id, fromDate: "2026-11-02" },
      NOW,
    );
    expect(res).toEqual({ created: 3, skipped: 1 });
  });
});

describe("CSV import", () => {
  const csv = [
    "date;heure;salle;film;version;prix",
    "05/11/2026;14h00;alpha;POUPIYA;vf;500",
    "2026-11-05;20:30;Alpha;Poupiya;Doublé arabe;600 DA",
  ].join("\n");

  it("previews, then imports, matching screens and films loosely", async () => {
    const preview = await importProgrammeCsv(
      db,
      contributor,
      { cinemaId: venue.cinemaA.id, csv, dryRun: true },
      NOW,
    );
    expect(preview.errors).toEqual([]);
    expect(preview.preview).toHaveLength(2);
    expect(preview.preview[1]).toMatchObject({ version: "AR_DUB", price: 600, hall: "Alpha" });
    expect(await db.select().from(screenings)).toHaveLength(0);

    const done = await importProgrammeCsv(
      db,
      contributor,
      { cinemaId: venue.cinemaA.id, csv, dryRun: false },
      NOW,
    );
    expect(done.created).toBe(2);
    expect(await db.select().from(screenings)).toHaveLength(2);
  });

  it("reports errors with the file's line numbers and saves nothing", async () => {
    const bad = [
      "date,heure,salle,film,version,prix",
      "2026-11-05,14:00,Alpha,Poupiya,VF,500",
      "2026-11-05,14:30,Alpha,Poupiya,VF,500",
      "2026-11-06,25:00,Alpha,Poupiya,VF,500",
      "2026-11-06,14:00,Salle inconnue,Poupiya,VF,500",
      "2026-11-06,14:00,Alpha,Film inconnu,VF,500",
      "2026-11-06,14:00,Alpha,Poupiya,IMAX,500",
      "2026-11-06,14:00,Alpha",
    ].join("\n");
    const res = await importProgrammeCsv(
      db,
      contributor,
      { cinemaId: venue.cinemaA.id, csv: bad, dryRun: false },
      NOW,
    );
    expect(res.errors).toEqual([
      { line: 8, code: "CSV_COLUMNS" },
      { line: 4, code: "INVALID_DATE" },
      { line: 5, code: "HALL_NOT_FOUND" },
      { line: 6, code: "MOVIE_NOT_FOUND" },
      { line: 7, code: "INVALID_VERSION" },
    ]);
    expect(await db.select().from(screenings)).toHaveLength(0);
  });

  it("maps overlap errors back to file lines", async () => {
    const res = await importProgrammeCsv(
      db,
      contributor,
      {
        cinemaId: venue.cinemaA.id,
        csv: "date;heure;salle;film;version;prix\n\n2026-11-05;14:00;Alpha;Poupiya;VF;500\n2026-11-05;14:30;Alpha;Poupiya;VF;500",
        dryRun: true,
      },
      NOW,
    );
    expect(res.errors).toEqual([{ line: 4, code: "OVERLAP" }]);
  });

  it("handles quoted cells and refuses other cinemas", async () => {
    expect(
      parseCsv(
        'date;heure;salle;film;version;prix\n2026-11-05;14:00;Alpha;"Spider-Man; le film";VF;500',
      ).rows[0]!.film,
    ).toBe("Spider-Man; le film");
    await expect(
      importProgrammeCsv(db, contributor, { cinemaId: venue.cinemaB.id, csv, dryRun: true }, NOW),
    ).rejects.toMatchObject({ code: "NOT_YOUR_CINEMA" });
  });
});
