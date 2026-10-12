// Middlewares des fonctions serveur : identité de l'utilisateur et contrôle
// des rôles. Toute fonction qui écrit ou lit des données privées DOIT passer
// par requireUser ou requireRole.
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authConfigured, getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { AppError } from "@/lib/errors";
import { getViewer, type AppRole } from "@/server/viewer";

export const withViewer = createMiddleware({ type: "function" }).server(async ({ next }) => {
  // Connexion non configurée : les pages publiques restent accessibles.
  const viewer = authConfigured()
    ? await getViewer(getDb(), getAuth(), new Headers(getRequestHeaders()))
    : null;
  return next({ context: { viewer, db: getDb() } });
});

export const requireUser = createMiddleware({ type: "function" })
  .middleware([withViewer])
  .server(async ({ next, context }) => {
    if (!context.viewer) throw new AppError("AUTH_REQUIRED", "Connexion requise");
    return next({ context: { viewer: context.viewer } });
  });

export function requireRole(...roles: AppRole[]) {
  return createMiddleware({ type: "function" })
    .middleware([requireUser])
    .server(async ({ next, context }) => {
      if (!roles.some((r) => context.viewer.roles.includes(r))) {
        throw new AppError("FORBIDDEN", "Accès refusé");
      }
      return next();
    });
}
