import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "@/server/db/client";
import { getImage } from "@/server/services/media";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sert une image envoyée par un administrateur. Le contenu d'un identifiant ne
// change jamais : mise en cache longue durée.
export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!UUID.test(params.id)) return new Response("Not found", { status: 404 });
        const image = await getImage(getDb(), params.id);
        if (!image) return new Response("Not found", { status: 404 });
        const etag = `"${image.sha256}"`;
        const headers = {
          "Content-Type": image.content_type,
          "Cache-Control": "public, max-age=31536000, immutable",
          ETag: etag,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
        };
        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, { status: 304, headers });
        }
        return new Response(new Uint8Array(image.data), { headers });
      },
    },
  },
});
