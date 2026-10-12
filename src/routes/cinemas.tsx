import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Building2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchCinemas } from "@/lib/api";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/cinemas")({
  head: () => ({
    meta: [
      { title: "Salles de cinéma en Algérie — BookCinéDZ" },
      {
        name: "description",
        content:
          "Adresses, salles et programme des cinémas d'Alger, Oran et Constantine : Ibn Khaldoun, Ibn Zaydoun, Cosmos, TMV, Cinégold et plus.",
      },
      { property: "og:title", content: "Cinémas — BookCinéDZ" },
      { property: "og:description", content: "Tous les cinémas partenaires et leurs salles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Cinemas,
});

function Cinemas() {
  const cinemas = useQuery({ queryKey: ["cinemas"], queryFn: fetchCinemas });

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.cinemas}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Retrouvez les salles partenaires et leur programme.
        </p>

        <div className="mt-5 space-y-3">
          {cinemas.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          {(cinemas.data ?? []).map((c) => (
            <Link
              key={c.id}
              to="/cinema/$cinemaId"
              params={{ cinemaId: c.id }}
              className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                  <Building2 className="size-5 text-primary" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold">{c.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" />
                    {c.address ?? c.city?.name}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(c.halls ?? []).map((h) => (
                      <Badge key={h.id} variant="secondary" className="rounded-full text-[11px] font-normal">
                        {h.name} · {h.capacity} {t.cinema.capacity}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
