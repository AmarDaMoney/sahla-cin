// Traduit les codes d'erreur de Better Auth dans la langue de l'interface.
import { DICTIONARIES, type Lang } from "@/lib/i18n";

// Noms de codes équivalents selon les versions de Better Auth.
const ALIASES: Record<string, string> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "USER_ALREADY_EXISTS",
};

export function authErrorMessage(
  error: { code?: string | undefined; status?: number | undefined },
  lang: Lang,
) {
  const t = DICTIONARIES[lang];
  if (error.status === 429) return t.authErrors["TOO_MANY_REQUESTS"]!;
  const code = error.code ? (ALIASES[error.code] ?? error.code) : null;
  if (code && t.authErrors[code]) return t.authErrors[code]!;
  // Le code aide à diagnostiquer (voir aussi /api/health).
  const detail = error.code ?? (error.status ? `HTTP ${error.status}` : null);
  return detail ? `${t.common.error} (${detail})` : t.common.error;
}
