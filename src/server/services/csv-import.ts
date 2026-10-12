// Import du programme d'un cinéma depuis un tableur (CSV), par exemple exporté
// d'Excel. Colonnes : date ; heure ; salle ; film ; version ; prix.
// Tout ou rien : la moindre erreur est signalée avec son numéro de ligne et
// rien n'est enregistré.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { halls, screenings } from "../db/schema";
import type { Viewer } from "../viewer";
import {
  assertManagesCinema,
  createScreenings,
  parseAlgiersLocal,
  type LineError,
  type NewScreening,
} from "./programme";

type AudioLanguage = (typeof screenings.$inferSelect)["audio_language"];

export const CSV_COLUMNS = ["date", "heure", "salle", "film", "version", "prix"] as const;
const MAX_ROWS = 300;

export type CsvRow = {
  line: number;
  date: string;
  time: string;
  hall: string;
  film: string;
  version: string;
  price: string;
};

// Comparaison sans casse, accents ni ponctuation.
const key = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ًͯ-ْ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");

const VERSIONS: Record<string, AudioLanguage> = {
  vf: "VF",
  vo: "VO",
  vostfr: "VOSTFR",
  vostf: "VOSTFR",
  vost: "VOSTFR",
  vostar: "VOSTAR",
  ardub: "AR_DUB",
  arabe: "AR_DUB",
  doublearabe: "AR_DUB",
  ar: "AR_DUB",
};

function splitLine(line: string, sep: string): string[] {
  // Gère les guillemets autour des valeurs ("Spider-Man, le film").
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parseCsv(text: string): { rows: CsvRow[]; errors: LineError[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = lines.find((l) => l.trim()) ?? "";
  const sep = [";", "\t", ","].sort((a, b) => first.split(b).length - first.split(a).length)[0]!;
  const rows: CsvRow[] = [];
  const errors: LineError[] = [];
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cells = splitLine(raw, sep);
    if (key(cells[0] ?? "") === "date") return; // ligne d'en-tête
    if (cells.length < 6 || cells.slice(0, 6).some((c) => !c)) {
      errors.push({ line, code: "CSV_COLUMNS" });
      return;
    }
    const [date, time, hall, film, version, price] = cells as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    rows.push({ line, date, time, hall, film, version, price });
  });
  if (rows.length > MAX_ROWS)
    errors.push({ line: rows[MAX_ROWS]!.line, code: "TOO_MANY_SCREENINGS" });
  return { rows, errors };
}

function toIsoDate(value: string): string | null {
  let m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

function toTime(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})(?:[:hH.](\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? "0");
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type CsvPreview = {
  line: number;
  startsAt: string;
  hall: string;
  film: string;
  version: AudioLanguage;
  price: number;
};

export async function importProgrammeCsv(
  db: Db,
  viewer: Viewer,
  input: { cinemaId: string; csv: string; dryRun: boolean },
  now = new Date(),
): Promise<{ created: number; preview: CsvPreview[]; errors: LineError[] }> {
  await assertManagesCinema(db, viewer, input.cinemaId);
  const parsed = parseCsv(input.csv);
  const errors = [...parsed.errors];

  const hallRows = await db
    .select({ id: halls.id, name: halls.name })
    .from(halls)
    .where(eq(halls.cinema_id, input.cinemaId));
  const hallByName = new Map(hallRows.map((h) => [key(h.name), h]));

  const movieRows = await db.query.movies.findMany({
    columns: {
      id: true,
      title: true,
      title_ar: true,
      title_en: true,
      original_title: true,
    },
  });
  const movieByTitle = new Map<string, (typeof movieRows)[number]>();
  for (const m of movieRows) {
    for (const t of [m.title, m.title_ar, m.title_en, m.original_title]) {
      if (t && !movieByTitle.has(key(t))) movieByTitle.set(key(t), m);
    }
  }

  const items: NewScreening[] = [];
  const preview: CsvPreview[] = [];
  for (const row of parsed.rows) {
    const date = toIsoDate(row.date);
    const time = toTime(row.time);
    const hall = hallByName.get(key(row.hall));
    const movie = movieByTitle.get(key(row.film));
    const version = VERSIONS[key(row.version)];
    const price = Number(row.price.replace(/\s|da|دج/gi, ""));
    const fail = (code: string) => errors.push({ line: row.line, code });
    if (!date || !time) fail("INVALID_DATE");
    else if (!hall) fail("HALL_NOT_FOUND");
    else if (!movie) fail("MOVIE_NOT_FOUND");
    else if (!version) fail("INVALID_VERSION");
    else if (!Number.isInteger(price) || price < 0) fail("INVALID_PRICE");
    else {
      const startsAt = parseAlgiersLocal(`${date}T${time}`);
      items.push({ hallId: hall.id, movieId: movie.id, startsAt, price, audioLanguage: version });
      preview.push({
        line: row.line,
        startsAt: startsAt.toISOString(),
        hall: hall.name,
        film: movie.title,
        version,
        price,
      });
    }
  }
  if (errors.length) return { created: 0, preview, errors };

  // Vérifie droits, dates passées et chevauchements ; enregistre si !dryRun.
  const result = await createScreenings(db, viewer, items, now, { dryRun: input.dryRun });
  return {
    created: input.dryRun ? 0 : result.created,
    preview,
    errors: result.errors.map((e) => ({ ...e, line: preview[e.line - 1]!.line })),
  };
}
