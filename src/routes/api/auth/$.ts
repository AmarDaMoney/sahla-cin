import { createFileRoute } from "@tanstack/react-router";
import { authConfigured, getAuth } from "@/server/auth";

function handle(request: Request) {
  if (!authConfigured()) {
    return Response.json(
      {
        code: "AUTH_NOT_CONFIGURED",
        message: "Connexion indisponible : configuration incomplète (voir /api/health).",
      },
      { status: 503 },
    );
  }
  return getAuth().handler(request);
}

// Points d'entrée de Better Auth : /api/auth/sign-in/email, /api/auth/sign-up/email…
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
