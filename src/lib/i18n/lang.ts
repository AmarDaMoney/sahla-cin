// Langues de l'interface. Fichier sans React : utilisable côté serveur
// (e-mails, rendu initial) comme dans le navigateur.

export const LANGS = ["fr", "ar", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "fr";
export const LANG_COOKIE = "lang";

export const LANG_NAMES: Record<Lang, string> = { fr: "Français", ar: "العربية", en: "English" };

export const isLang = (v: unknown): v is Lang => typeof v === "string" && LANGS.includes(v as Lang);
export const dirOf = (lang: Lang): "rtl" | "ltr" => (lang === "ar" ? "rtl" : "ltr");

// Arabe d'Algérie (chiffres latins), anglais britannique (dates jour/mois).
export const LOCALES: Record<Lang, string> = { fr: "fr-FR", ar: "ar-DZ", en: "en-GB" };

// Langue choisie (cookie), sinon la préférence du navigateur, sinon le français.
export function langFromHeaders(headers: Headers): Lang {
  const cookie = headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)lang=([a-z]{2})/);
  if (match && isLang(match[1])) return match[1];
  const accepted = (headers.get("accept-language") ?? "")
    .split(",")
    .map((part) => part.trim().slice(0, 2).toLowerCase());
  return accepted.find(isLang) ?? DEFAULT_LANG;
}

export function setLangCookie(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

// Formats de date (toujours à l'heure d'Alger).
const PRESETS = {
  full: { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" },
  medium: { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" },
  day: { weekday: "long", day: "numeric", month: "long" },
  dayShort: { weekday: "short", day: "numeric", month: "short" },
  time: { hour: "2-digit", minute: "2-digit" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;
export type DatePreset = keyof typeof PRESETS;

const cache = new Map<string, Intl.DateTimeFormat>();
export function formatDate(lang: Lang, value: string | Date, preset: DatePreset) {
  const key = `${lang}:${preset}`;
  let fmt = cache.get(key);
  if (!fmt) {
    // Horaires sur 24 h dans toutes les langues (usage des cinémas algériens).
    fmt = new Intl.DateTimeFormat(LOCALES[lang], {
      timeZone: "Africa/Algiers",
      hour12: false,
      ...PRESETS[preset],
    });
    cache.set(key, fmt);
  }
  return fmt.format(typeof value === "string" ? new Date(value) : value);
}

// Champ traduit : version de la langue si elle existe, sinon le français.
type Localized = Record<string, unknown>;
export function localized(row: Localized, field: string, lang: Lang): string {
  const translated = lang === "fr" ? null : row[`${field}_${lang}`];
  const value = typeof translated === "string" && translated.trim() ? translated : row[field];
  return typeof value === "string" ? value : "";
}
