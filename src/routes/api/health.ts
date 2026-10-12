import { createFileRoute } from "@tanstack/react-router";
import { inArray, sql } from "drizzle-orm";
import { adminEmails, appUrl, configChecks, envValue, hasClientIp } from "@/server/config";
import { getDb } from "@/server/db/client";
import { user } from "@/server/db/schema";

// Diagnostic de l'installation : ouvrir /api/health dans le navigateur.
// N'affiche que des oui/non, jamais la valeur des réglages ni d'adresse e-mail.
async function databaseStatus() {
  if (!envValue("DATABASE_URL")) return "DATABASE_URL manquant";
  try {
    const rows = (await getDb().execute(
      sql`select to_regclass('public.user') is not null as ready`,
    )) as unknown as { ready: boolean }[];
    return rows[0]?.ready ? "ok" : "connectée, mais tables absentes (migrations non appliquées)";
  } catch (e) {
    console.error("[health] base de données", e);
    return "connexion impossible (voir les logs)";
  }
}

// Les adresses de ADMIN_EMAILS correspondent-elles à des comptes confirmés ?
async function adminStatus() {
  const emails = adminEmails();
  if (!emails.length) return "aucune adresse dans ADMIN_EMAILS";
  try {
    const rows = await getDb()
      .select({ email_verified: user.emailVerified })
      .from(user)
      .where(inArray(sql`lower(${user.email})`, emails));
    const verified = rows.filter((r) => r.email_verified).length;
    if (verified) return `ok — ${verified} compte(s) administrateur confirmé(s)`;
    if (rows.length) {
      return "compte trouvé mais adresse pas encore confirmée (cliquez le lien de l'e-mail)";
    }
    return "aucun compte créé avec cette adresse (vérifiez l'orthographe exacte, y compris les points)";
  } catch (e) {
    console.error("[health] admin", e);
    return "vérification impossible";
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const database = await databaseStatus();
        const admin = database === "ok" ? await adminStatus() : "base indisponible";
        const checks = configChecks();
        const missing = checks.filter((c) => c.required && !c.ok);
        const ok = database === "ok" && missing.length === 0;
        const body = {
          status: ok ? "ok" : "problème",
          database,
          address: appUrl() ?? "inconnue",
          admin,
          settings: Object.fromEntries(
            checks.map((c) => [
              c.name,
              c.ok ? "ok" : `${c.required ? "MANQUANT" : "absent"} — ${c.hint}`,
            ]),
          ),
          email: envValue("RESEND_API_KEY")
            ? "envoyés via Resend"
            : "non envoyés : liens écrits dans les logs Railway",
          // Sans IP par visiteur, toutes les connexions partagent un même compteur.
          rateLimit: hasClientIp(request.headers)
            ? "par visiteur (IP reçue)"
            : "PARTAGÉE — l'hébergeur n'envoie pas l'IP du visiteur (voir CLIENT_IP_HEADER)",
          filmImport: envValue("TMDB_API_KEY") ? "TMDB activé" : "TMDB non configuré (facultatif)",
          payment: envValue("PAYMENT_MODE") === "simulation" ? "simulation" : "guichet uniquement",
        };
        return new Response(JSON.stringify(body, null, 2), {
          status: ok ? 200 : 503,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
