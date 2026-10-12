import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Navigation } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCinema, fetchPublishedScreenings } from "@/lib/api";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/cinema/$cinemaId")({
  head: () => ({
    meta: [
      { title: "Programme du cinéma — BookCinéDZ" },
      {
        name: "description",
        content: "Adresse, salles, itinéraire et séances à venir de ce cinéma en Algérie.",
      },
      { property: "og:title", content: "Fiche cinéma — BookCinéDZ" },
      { property: "og:description", content: "Séances à venir et informations pratiques." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CinemaPage,
});

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function mapsLink(cinema: { name: string; address: string | null; latitude: number | null; longitude: number | null }) {
  if (cinema.latitude != null && cinema.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${cinema.latitude},${cinema.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cinema.name} ${cinema.address ?? ""}`)}`;
}

function CinemaPage() {
  const { cinemaId } = Route.useParams();
  const cinema = useQuery({ queryKey: ["cinema", cinemaId], queryFn: () => fetchCinema(cinemaId) });
  const screenings = useQuery({
    queryKey: ["screenings", "published"],
    queryFn: fetchPublishedScreenings,
  });

  const list = (screenings.data ?? []).filter((s) => s.hall.cinema.id === cinemaId);

  return (
    <div className="min-h-screen pb-24">
      <AppHeader
        right={
          <Link
            to="/cinemas"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t.common.back}
          </Link>
        }
      />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {cinema.isLoading ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : (
          cinema.data && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h1 className="text-xl font-bold">{cinema.data.name}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-4" />
                {cinema.data.address ?? cinema.data.city?.name}
              </p>
              {cinema.data.description && (
                <p className="mt-2 text-sm text-muted-foreground">{cinema.data.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(cinema.data.halls ?? []).map((h) => (
                  <Badge key={h.id} variant="secondary" className="rounded-full font-normal">
                    {h.name} · {h.capacity} {t.cinema.capacity}
                    {h.type === "vip" ? " · VIP" : ""}
                  </Badge>
                ))}
              </div>
              <Button asChild className="mt-4 w-full rounded-xl">
                <a href={mapsLink(cinema.data)} target="_blank" rel="noopener noreferrer">
                  <Navigation className="size-4" />
                  {t.cinema.itinerary}
                </a>
              </Button>
            </div>
          )
        )}

        <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-primary">
          {t.movie.screenings}
        </h2>
        <div className="mt-3 space-y-3">
          {list.length === 0 && !screenings.isLoading && (
            <p className="text-sm text-muted-foreground">{t.movie.noScreenings}</p>
          )}
          {list.map((s) => (
            <Link
              key={s.id}
              to="/reserver/$screeningId"
              params={{ screeningId: s.id }}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.movie.title}</p>
                <p className="text-xs text-muted-foreground">
                  {dayFmt.format(new Date(s.starts_at))} · {timeFmt.format(new Date(s.starts_at))} ·{" "}
                  {t.languages[s.audio_language]} · {s.hall.name}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-primary">
                {s.price} {t.common.da}
              </span>
            </Link>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
