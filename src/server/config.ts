// Configuration lue dans les variables d'environnement (onglet « Variables »
// du service sur Railway). Tolère les petites erreurs de saisie courantes.

// Adresse publique de l'application, sans « / » final.
// Ordre : BETTER_AUTH_URL, sinon le domaine public fourni par Railway.
export function appUrl(): string | undefined {
  let url = process.env["BETTER_AUTH_URL"]?.trim();
  if (!url) {
    const domain = process.env["RAILWAY_PUBLIC_DOMAIN"]?.trim();
    if (domain) url = `https://${domain}`;
  }
  if (!url) return undefined;
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

export type ConfigCheck = { name: string; ok: boolean; required: boolean; hint: string };

// Liste des réglages, sans jamais exposer leurs valeurs.
export function configChecks(): ConfigCheck[] {
  const env = (name: string) => !!process.env[name]?.trim();
  const secret = process.env["BETTER_AUTH_SECRET"]?.trim() ?? "";
  return [
    {
      name: "DATABASE_URL",
      ok: env("DATABASE_URL"),
      required: true,
      hint: "Valeur : ${{Postgres.DATABASE_URL}}",
    },
    {
      name: "BETTER_AUTH_SECRET",
      ok: secret.length >= 32,
      required: true,
      hint: "32 caractères aléatoires ou plus",
    },
    {
      name: "BETTER_AUTH_URL",
      ok: !!appUrl(),
      required: true,
      hint: "Adresse publique du site, ex. https://bookcine.up.railway.app",
    },
    {
      name: "ADMIN_EMAILS",
      ok: env("ADMIN_EMAILS"),
      required: false,
      hint: "Votre adresse e-mail, pour être administrateur",
    },
    {
      name: "RESEND_API_KEY",
      ok: env("RESEND_API_KEY"),
      required: false,
      hint: "Sans elle, les liens des e-mails sont écrits dans les logs Railway",
    },
  ];
}
