// Langue de l'interface pour les composants React : const { t, lang } = useI18n().
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ar } from "./ar";
import { en } from "./en";
import { fr, type Dict } from "./fr";
import { dirOf, formatDate, localized, setLangCookie, type DatePreset, type Lang } from "./lang";

export * from "./lang";
export type { Dict };

export const DICTIONARIES: Record<Lang, Dict> = { fr, ar, en };

const LangContext = createContext<Lang>("fr");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

// Message d'une erreur serveur : « [CODE] message » (voir src/start.ts).
export function parseServerError(error: unknown): { code: string | null; message: string } {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = raw.match(/^\[([A-Z_]+)\] ([\s\S]*)$/);
  return match ? { code: match[1]!, message: match[2]! } : { code: null, message: raw };
}

export function translate(lang: Lang) {
  const t = DICTIONARIES[lang];
  return {
    lang,
    t,
    dir: dirOf(lang),
    date: (value: string | Date, preset: DatePreset) => formatDate(lang, value, preset),
    // Titre du film dans la langue choisie, et titre secondaire (l'autre écriture).
    title: (m: { title: string; title_ar?: string | null; title_en?: string | null }) =>
      localized(m, "title", lang),
    subtitle: (m: { title: string; title_ar?: string | null }) =>
      lang === "ar" ? (m.title_ar ? m.title : null) : (m.title_ar ?? null),
    synopsis: (m: { synopsis: string | null }) => localized(m, "synopsis", lang) || null,
    city: (c: { name: string; name_ar?: string | null; name_en?: string | null }) =>
      localized(c, "name", lang),
    genres: (value: string | null) =>
      (value ?? "")
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
        .map((g) => ({ key: g, label: t.genres[g] ?? g })),
    rating: (value: string) => t.ratings[value] ?? value,
    error: (e: unknown) => {
      const { code, message } = parseServerError(e);
      return (code && t.errors[code]) || message || t.common.error;
    },
  };
}

export type I18n = ReturnType<typeof translate>;

export function useI18n(): I18n {
  const lang = useContext(LangContext);
  return useMemo(() => translate(lang), [lang]);
}

export function changeLang(lang: Lang) {
  setLangCookie(lang);
  window.location.reload();
}
