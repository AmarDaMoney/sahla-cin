import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BottomNav } from "@/components/BottomNav";
import { MoviePoster } from "@/components/MoviePoster";
import { fetchMovie, fetchPublishedScreenings } from "@/lib/api";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/film/$movieId")({
  head: () => ({
    meta: [
      { title: "Séances et réservation du film — BookCinéDZ" },
      {
        name: "description",
        content:
          "Synopsis, durée, genres et séances par cinéma. Réservez vos places de cinéma en Algérie en quelques secondes.",
      },
      { property: "og:title", content: "Fiche film — BookCinéDZ" },
      {
        property: "og:description",
        content: "Toutes les séances publiées de ce film dans les cinémas algériens.",
      },
      { property: "og:type", content: "video.movie" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MoviePage,
});

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function MoviePage() {
  const { movieId } = Route.useParams();
  const movie = useQuery({ queryKey: ["movie", movieId], queryFn: () => fetchMovie(movieId) });
  const screenings = useQuery({
    queryKey: ["screenings", "published"],
    queryFn: fetchPublishedScreenings,
  });

  const mine = (screenings.data ?? []).filter((s) => s.movie_id === movieId);

  const byCinemaDay = new Map<string, typeof mine>();
  mine.forEach((s) => {
    const key = `${s.hall.cinema.id}|${s.starts_at.slice(0, 10)}`;
    const arr = byCinemaDay.get(key) ?? [];
    arr.push(s);
    byCinemaDay.set(key, arr);
  });

  return (
    <div className="min-h-screen pb-24">
      <div className="relative">
        <MoviePoster
          src={movie.data?.poster_url ?? null}
          alt={`Affiche du film ${movie.data?.title ?? ""}`}
          className="h-[46vh] max-h-[400px] w-full"
        />
        <div className="poster-fade absolute inset-0" />
        <Link
          to="/"
          aria-label={t.common.back}
          className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-full bg-background/70 backdrop-blur transition-colors hover:bg-background"
        >
          <ArrowLeft className="size-5" />
        </Link>
      </div>

      <main className="relative z-10 mx-auto -mt-12 max-w-3xl px-4">
        {movie.isLoading ? (
          <Skeleton className="h-8 w-2/3" />
        ) : (
          <h1 className="text-2xl font-bold leading-tight">{movie.data?.title}</h1>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-4" />
            {movie.data?.duration_minutes} {t.common.minutes}
          </span>
          {movie.data?.age_rating && <Badge variant="secondary">{movie.data.age_rating}</Badge>}
          {(movie.data?.genre ?? "")
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean)
            .map((g) => (
              <Badge key={g} variant="secondary" className="rounded-full font-normal">
                {g}
              </Badge>
            ))}
        </div>

        {movie.data?.synopsis && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
              {t.movie.synopsis}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {movie.data.synopsis}
            </p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
            {t.movie.screenings}
          </h2>

          {screenings.isLoading && <Skeleton className="mt-3 h-28 w-full rounded-2xl" />}
          {!screenings.isLoading && mine.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">{t.movie.noScreenings}</p>
          )}

          <div className="mt-3 space-y-3">
            {[...byCinemaDay.entries()].map(([key, group]) => {
              const first = group[0]!;
              return (
                <div key={key} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{first.hall.cinema.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {first.hall.cinema.city?.name} · {dayFmt.format(new Date(first.starts_at))}
                      </p>
                    </div>
                    <Link
                      to="/cinema/$cinemaId"
                      params={{ cinemaId: first.hall.cinema.id }}
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      {t.cinema.map}
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group
                      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
                      .map((s) => (
                        <Button
                          key={s.id}
                          asChild
                          size="sm"
                          className="h-auto flex-col gap-0 rounded-xl px-4 py-2"
                        >
                          <Link to="/reserver/$screeningId" params={{ screeningId: s.id }}>
                            <span className="text-sm font-semibold">
                              {timeFmt.format(new Date(s.starts_at))}
                            </span>
                            <span className="text-[10px] opacity-80">
                              {t.languages[s.audio_language]} · {s.hall.name} · {s.price} {t.common.da}
                            </span>
                          </Link>
                        </Button>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
