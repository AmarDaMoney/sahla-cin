import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BottomNav } from "@/components/BottomNav";
import { MoviePoster } from "@/components/MoviePoster";
import { fetchMovie, fetchPublishedScreenings } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const Route = createFileRoute("/film/$movieId")({
  head: pageHead("movie"),
  component: MoviePage,
});

// Jour calendaire à Alger (AAAA-MM-JJ), pour regrouper les séances.
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" });

function MoviePage() {
  const { movieId } = Route.useParams();
  const { t, date, title, subtitle, synopsis, city, genres, rating } = useI18n();
  const movie = useQuery({
    queryKey: ["movie", movieId],
    queryFn: () => fetchMovie({ data: movieId }),
  });
  const screenings = useQuery({
    queryKey: ["screenings", "published"],
    queryFn: () => fetchPublishedScreenings(),
  });

  const mine = (screenings.data ?? []).filter((s) => s.movie_id === movieId);

  const byCinemaDay = new Map<string, typeof mine>();
  mine.forEach((s) => {
    const key = `${s.hall.cinema.id}|${dayKey.format(new Date(s.starts_at))}`;
    const arr = byCinemaDay.get(key) ?? [];
    arr.push(s);
    byCinemaDay.set(key, arr);
  });

  return (
    <div className="min-h-screen pb-24">
      <div className="relative">
        <MoviePoster
          src={movie.data?.poster_url ?? null}
          alt={movie.data ? t.common.posterOf(title(movie.data)) : ""}
          className="h-[46vh] max-h-[400px] w-full"
        />
        <div className="poster-fade absolute inset-0" />
        <Link
          to="/"
          aria-label={t.common.back}
          className="absolute start-4 top-4 flex size-10 items-center justify-center rounded-full bg-background/70 backdrop-blur transition-colors hover:bg-background"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </Link>
        <div className="absolute end-4 top-4">
          <LanguageSwitcher />
        </div>
      </div>

      <main className="relative z-10 mx-auto -mt-12 max-w-3xl px-4">
        {movie.isLoading ? (
          <Skeleton className="h-8 w-2/3" />
        ) : (
          <>
            <h1 className="text-2xl font-bold leading-tight">
              {movie.data ? title(movie.data) : ""}
            </h1>
            {movie.data && subtitle(movie.data) && (
              <p
                dir="auto"
                lang={movie.data.original_language ?? undefined}
                className="mt-1 text-muted-foreground"
              >
                {subtitle(movie.data)}
              </p>
            )}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-4" />
            {movie.data?.duration_minutes} {t.common.minutes}
          </span>
          {movie.data?.age_rating && (
            <Badge variant="secondary">{rating(movie.data.age_rating)}</Badge>
          )}
          {genres(movie.data?.genre ?? null).map((g) => (
            <Badge key={g.key} variant="secondary" className="rounded-full font-normal">
              {g.label}
            </Badge>
          ))}
          {movie.data?.trailer_url && (
            <a
              href={movie.data.trailer_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary underline-offset-4 hover:underline"
            >
              <PlayCircle className="size-4" />
              {t.movie.trailer}
            </a>
          )}
        </div>

        {movie.data && synopsis(movie.data) && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
              {t.movie.synopsis}
            </h2>
            <p dir="auto" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {synopsis(movie.data)}
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
                        {first.hall.cinema.city ? city(first.hall.cinema.city) : ""} ·{" "}
                        {date(first.starts_at, "day")}
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
                              {date(s.starts_at, "time")}
                            </span>
                            <span className="text-[10px] opacity-80">
                              {t.languages[s.audio_language]} · {s.hall.name} · {s.price}{" "}
                              {t.common.da}
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
