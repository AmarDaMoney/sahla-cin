import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";
import { appUrl, configChecks } from "@/server/config";
import { getDb } from "@/server/db/client";

// Diagnostic de l'installation : ouvrir /api/health dans le navigateur.
// N'affiche que des oui/non, jamais la valeur des réglages.
async function databaseStatus() {
  if (!process.env["DATABASE_URL"]) return "DATABASE_URL manquant";
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

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const database = await databaseStatus();
        const checks = configChecks();
        const missing = checks.filter((c) => c.required && !c.ok);
        const ok = database === "ok" && missing.length === 0;
        const body = {
          status: ok ? "ok" : "problème",
          database,
          address: appUrl() ?? "inconnue",
          settings: Object.fromEntries(
            checks.map((c) => [
              c.name,
              c.ok ? "ok" : `${c.required ? "MANQUANT" : "absent"} — ${c.hint}`,
            ]),
          ),
          email: process.env["RESEND_API_KEY"]
            ? "envoyés via Resend"
            : "non envoyés : liens écrits dans les logs Railway",
          payment:
            process.env["PAYMENT_MODE"] === "simulation" ? "simulation" : "guichet uniquement",
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
