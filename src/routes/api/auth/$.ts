import { createFileRoute } from "@tanstack/react-router";
import { getAuth } from "@/server/auth";

// Points d'entrée de Better Auth : /api/auth/sign-in/email, /api/auth/sign-up/email…
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => getAuth().handler(request),
      POST: ({ request }) => getAuth().handler(request),
    },
  },
});
