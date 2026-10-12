import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { AppError } from "./lib/errors";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Les erreurs inattendues des fonctions serveur (SQL, réseau…) ne doivent
// jamais révéler de détails au navigateur : seules les AppError gardent leur message.
const serverFnErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Le code permet au navigateur d'afficher le message dans la langue choisie.
    if (error instanceof AppError) throw new Error(`[${error.code}] ${error.message}`);
    console.error(error);
    throw new Error("Une erreur est survenue. Réessayez plus tard.");
  }
});

// Start installe ce middleware automatiquement quand src/start.ts est absent ;
// définir ce fichier le désactive, on le remet donc explicitement pour protéger
// les fonctions serveur contre les requêtes inter-sites.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [serverFnErrors],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
