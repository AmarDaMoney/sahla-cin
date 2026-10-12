// Configuration lue dans les variables d'environnement (onglet « Variables »
// du service sur Railway). Tolère les erreurs de saisie courantes, et repère
// les valeurs d'exemple recopiées depuis .env.example.

const env = (name: string) => process.env[name]?.trim() ?? "";

// Valeurs d'exemple de .env.example : présentes mais inutilisables.
const EXAMPLE_MARKERS = ["changez-moi", "votre-domaine", "vous@exemple.com", "<project-ref>"];
export const isExampleValue = (value: string) =>
  EXAMPLE_MARKERS.some((m) => value.toLowerCase().includes(m));

const isLocal = (url: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(url);

function normalize(url: string) {
  const withScheme = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return withScheme.replace(/\/+$/, "");
}

// Adresse publique de l'application, sans « / » final.
// BETTER_AUTH_URL, sinon le domaine public fourni par Railway. Une adresse
// locale (localhost) est ignorée quand l'application tourne sur Railway.
export function appUrl(): string | undefined {
  const railway = env("RAILWAY_PUBLIC_DOMAIN");
  const configured = env("BETTER_AUTH_URL");
  if (configured && !(railway && isLocal(normalize(configured)))) return normalize(configured);
  if (railway) return normalize(railway);
  return undefined;
}

export function authSecret(): string | undefined {
  const secret = env("BETTER_AUTH_SECRET");
  return secret.length >= 32 && !isExampleValue(secret) ? secret : undefined;
}

export type ConfigCheck = { name: string; ok: boolean; required: boolean; hint: string };

// Liste des réglages, sans jamais exposer leurs valeurs.
export function configChecks(): ConfigCheck[] {
  const usable = (name: string) => !!env(name) && !isExampleValue(env(name));
  const url = appUrl();
  return [
    {
      name: "DATABASE_URL",
      ok: usable("DATABASE_URL"),
      required: true,
      hint: "Valeur : ${{Postgres.DATABASE_URL}}",
    },
    {
      name: "BETTER_AUTH_SECRET",
      ok: !!authSecret(),
      required: true,
      hint: "32 caractères aléatoires ou plus (pas la valeur d'exemple)",
    },
    {
      name: "BETTER_AUTH_URL",
      ok: !!url && (!isLocal(url) || !env("RAILWAY_PUBLIC_DOMAIN")),
      required: true,
      hint: "Adresse publique du site (https://…). Sur Railway : supprimez la variable, le domaine est détecté automatiquement",
    },
    {
      name: "ADMIN_EMAILS",
      ok: usable("ADMIN_EMAILS"),
      required: false,
      hint: "Votre adresse e-mail, pour être administrateur",
    },
    {
      name: "RESEND_API_KEY",
      ok: usable("RESEND_API_KEY") && env("RESEND_API_KEY").startsWith("re_"),
      required: false,
      hint: "Clé Resend (commence par re_). Sans elle, les liens des e-mails sont écrits dans les logs Railway",
    },
    {
      name: "EMAIL_FROM",
      ok: !env("RESEND_API_KEY") || usable("EMAIL_FROM"),
      required: false,
      hint: "Expéditeur sur un domaine vérifié dans Resend, ou supprimez la variable pour l'adresse de test de Resend",
    },
  ];
}
