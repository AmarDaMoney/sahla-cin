import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Navigation } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCinema, fetchPublishedScreenings } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";

export const Route = createFileRoute("/cinema/$cinemaId")({
  head: pageHead("cinema"),
  component: CinemaPage,
});

function mapsLink(cinema: {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  if (cinema.latitude != null && cinema.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${cinema.latitude},${cinema.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${cinema.name} ${cinema.address ?? ""}`)}`;
}

function CinemaPage() {
  const { cinemaId } = Route.useParams();
  const { t, date, title, city } = useI18n();
  const cinema = useQuery({
    queryKey: ["cinema", cinemaId],
    queryFn: () => fetchCinema({ data: cinemaId }),
  });
  const screenings = useQuery({
    queryKey: ["screenings", "published"],
    queryFn: () => fetchPublishedScreenings(),
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
            <ArrowLeft className="size-4 rtl:rotate-180" />
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
                {cinema.data.address ?? (cinema.data.city ? city(cinema.data.city) : "")}
              </p>
              {cinema.data.description && (
                <p className="mt-2 text-sm text-muted-foreground">{cinema.data.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(cinema.data.halls ?? []).map((h) => (
                  <Badge key={h.id} variant="secondary" className="rounded-full font-normal">
                    {h.name} · {t.cinema.seats(h.capacity)}
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
                <p className="truncate font-medium">{title(s.movie)}</p>
                <p className="text-xs text-muted-foreground">
                  {date(s.starts_at, "dayShort")} · {date(s.starts_at, "time")} ·{" "}
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
