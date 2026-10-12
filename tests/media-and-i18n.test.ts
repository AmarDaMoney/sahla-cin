import { describe, expect, it } from "vitest";
import { DICTIONARIES, parseServerError, translate } from "@/lib/i18n";
import { langFromHeaders, localized } from "@/lib/i18n/lang";
import { detectImageType, getImage, saveImage } from "@/server/services/media";
import { createTestDb, createUser } from "./helpers";

// Plus petite image PNG valide (1×1 pixel).
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("media", () => {
  it("recognises images by content, not by name", () => {
    expect(detectImageType(Buffer.from(PNG_1PX, "base64"))).toBe("image/png");
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("stores an image once and serves it back", async () => {
    const db = await createTestDb();
    const admin = await createUser(db, "admin@example.com");
    const first = await saveImage(db, admin.id, PNG_1PX);
    expect(first.url).toBe(`/api/media/${first.id}`);
    expect((await saveImage(db, admin.id, PNG_1PX)).id).toBe(first.id);
    const stored = await getImage(db, first.id);
    expect(stored?.content_type).toBe("image/png");
    expect(stored?.data.equals(Buffer.from(PNG_1PX, "base64"))).toBe(true);
  });

  it("rejects non-images and oversized files", async () => {
    const db = await createTestDb();
    const admin = await createUser(db, "admin@example.com");
    await expect(
      saveImage(db, admin.id, Buffer.from("<svg/>").toString("base64")),
    ).rejects.toMatchObject({ code: "IMAGE_FORMAT" });
    await expect(
      saveImage(db, admin.id, Buffer.alloc(3_100_000).toString("base64")),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
  });
});

describe("i18n", () => {
  // Toutes les clés du français existent en arabe et en anglais.
  function keys(value: unknown, prefix = ""): string[] {
    if (value && typeof value === "object") {
      return Object.entries(value).flatMap(([k, v]) => keys(v, `${prefix}${k}.`));
    }
    return [prefix];
  }
  const RECORDS = ["authErrors.", "errors.", "languages.", "genres.", "ratings."];
  const structural = (k: string) => !RECORDS.some((r) => k.startsWith(r));

  it("has the same keys in every language", () => {
    const fr = keys(DICTIONARIES.fr).filter(structural);
    expect(keys(DICTIONARIES.ar).filter(structural)).toEqual(fr);
    expect(keys(DICTIONARIES.en).filter(structural)).toEqual(fr);
  });

  it("translates every server error code", () => {
    const codes = Object.keys(DICTIONARIES.fr.errors);
    for (const lang of ["ar", "en"] as const) {
      expect(Object.keys(DICTIONARIES[lang].errors).sort()).toEqual([...codes].sort());
    }
  });

  it("picks the language from the cookie, then the browser", () => {
    expect(langFromHeaders(new Headers({ cookie: "a=1; lang=ar" }))).toBe("ar");
    expect(langFromHeaders(new Headers({ "accept-language": "en-US,en;q=0.9" }))).toBe("en");
    expect(langFromHeaders(new Headers({ "accept-language": "de-DE" }))).toBe("fr");
    expect(langFromHeaders(new Headers({ cookie: "lang=xx" }))).toBe("fr");
  });

  it("falls back to French when a translation is missing", () => {
    const movie = { title: "Poupiya", title_ar: "بوبية", title_en: null };
    expect(localized(movie, "title", "ar")).toBe("بوبية");
    expect(localized(movie, "title", "en")).toBe("Poupiya");
  });

  it("translates server errors by code", () => {
    const e = new Error("[SEATS_TAKEN] Ces sièges viennent d'être réservés.");
    expect(parseServerError(e).code).toBe("SEATS_TAKEN");
    expect(translate("en").error(e)).toBe("These seats were just booked. Please choose others.");
    expect(translate("ar").error(new Error("boom"))).toBe("boom");
  });

  it("uses Arabic plural forms", () => {
    const r = DICTIONARIES.ar.home.results;
    expect([r(1), r(2), r(5), r(11)]).toEqual(["نتيجة واحدة", "نتيجتان", "5 نتائج", "11 نتيجة"]);
  });
});

describe("dates", () => {
  it("shows times on the 24-hour clock, in Algiers time, in every language", async () => {
    const { formatDate } = await import("@/lib/i18n/lang");
    const show = new Date("2026-10-12T16:00:00Z"); // 17:00 à Alger
    expect(formatDate("fr", show, "time")).toBe("17:00");
    expect(formatDate("en", show, "time")).toBe("17:00");
    expect(formatDate("ar", show, "time")).toBe("17:00");
  });
});

describe("original title under the title", () => {
  it("follows the display rule for each language", async () => {
    const { originalSubtitle } = await import("@/lib/i18n");
    const spiderman = {
      title: "Spider-Man : Brand New Day",
      title_ar: "الرجل العنكبوت: يوم جديد",
      title_en: "Spider-Man: Brand New Day",
      original_title: "Spider-Man: Brand New Day",
      original_language: "en",
    };
    const poupiya = {
      title: "Poupiya",
      title_ar: "بوبية",
      title_en: "Poupiya",
      original_title: "بوبية",
      original_language: "ar",
    };
    const marius = {
      title: "Marius et le royaume des mers",
      title_ar: "ماريوس ومملكة البحار",
      title_en: "Marius and the Kingdom of the Sea",
      original_title: "Marius et le royaume des mers",
      original_language: "fr",
    };
    // Anglais : pas de second titre pour un film anglophone…
    expect(originalSubtitle(spiderman, "en")).toBeNull();
    // …mais le titre original d'un film arabe ou français.
    expect(originalSubtitle(poupiya, "en")).toBe("بوبية");
    expect(originalSubtitle(marius, "en")).toBe("Marius et le royaume des mers");
    // Français / arabe : titre original dès qu'il diffère (ponctuation ignorée).
    expect(originalSubtitle(spiderman, "fr")).toBeNull();
    expect(originalSubtitle(spiderman, "ar")).toBe("Spider-Man: Brand New Day");
    expect(originalSubtitle(poupiya, "fr")).toBe("بوبية");
    expect(originalSubtitle(poupiya, "ar")).toBeNull();
    expect(originalSubtitle(marius, "fr")).toBeNull();
    // Titre original inconnu : rien.
    expect(originalSubtitle({ title: "X", original_title: null }, "fr")).toBeNull();
  });
});
