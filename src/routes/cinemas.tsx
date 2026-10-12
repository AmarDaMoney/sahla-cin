import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Building2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fetchCinemas } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";

export const Route = createFileRoute("/cinemas")({
  head: pageHead("cinemas"),
  component: Cinemas,
});

function Cinemas() {
  const { t, city } = useI18n();
  const cinemas = useQuery({ queryKey: ["cinemas"], queryFn: () => fetchCinemas() });

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.cinemas}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.cinema.intro}</p>

        <div className="mt-5 space-y-3">
          {cinemas.isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
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
                    {c.address ?? (c.city ? city(c.city) : "")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(c.halls ?? []).map((h) => (
                      <Badge
                        key={h.id}
                        variant="secondary"
                        className="rounded-full text-[11px] font-normal"
                      >
                        {h.name} · {t.cinema.seats(h.capacity)}
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
