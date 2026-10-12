import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Le preset de déploiement est détecté automatiquement par Nitro (Vercel,
// Netlify, Cloudflare…). En local ou sur un VPS : serveur Node
// (`node .output/server/index.mjs`). Pour forcer une cible : NITRO_PRESET=vercel.
export default defineConfig({
  server: { port: 8080 },
  css: { transformer: "lightningcss" },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/query-core"],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // src/server.ts : enveloppe SSR qui affiche une page d'erreur propre.
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    nitro(),
    viteReact(),
  ],
});
