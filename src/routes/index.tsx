import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Clock, MapPin, Film, SlidersHorizontal, Tag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { MoviePoster } from "@/components/MoviePoster";
import { fetchCities, fetchPublishedScreenings, type ScreeningFull } from "@/lib/api";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BookCinéDZ — Films à l'affiche et réservation en Algérie" },
      {
        name: "description",
        content:
          "Programme des cinémas d'Alger, Oran et Constantine : recherche par titre français ou arabe, genre et cinéma, séances VO/VF/VOSTFR et réservation en ligne.",
      },
      { property: "og:title", content: "BookCinéDZ — Films à l'affiche" },
      {
        property: "og:description",
        content: "Consultez le programme des cinémas algériens et réservez votre place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// Normalise pour une recherche insensible aux accents (fr) et aux
// diacritiques / variantes de lettres (ar).
function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u064b-\u0652]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[ى]/g, "ي")
    .replace(/[ة]/g, "ه")
    .trim();
}

function Index() {
  const [query, setQuery] = useState("");
  const [cityId, setCityId] = useState("all");
  const [cinemaId, setCinemaId] = useState("all");
  const [genre, setGenre] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const cities = useQuery({ queryKey: ["cities"], queryFn: fetchCities });
  const screenings = useQuery({ queryKey: ["screenings", "published"], queryFn: fetchPublishedScreenings });

  const list = screenings.data ?? [];

  const cinemaOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; cityId: string }>();
    list.forEach((s) =>
      map.set(s.hall.cinema.id, {
        id: s.hall.cinema.id,
        name: s.hall.cinema.name,
        cityId: s.hall.cinema.city_id,
      }),
    );
    return [...map.values()]
      .filter((c) => cityId === "all" || c.cityId === cityId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list, cityId]);

  const genreOptions = useMemo(() => {
    const set = new Set<string>();
    list.forEach((s) =>
      (s.movie.genre ?? "")
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
        .forEach((g) => set.add(g)),
    );
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [list]);

  const movies = useMemo(() => {
    const q = normalize(query);
    const grouped = new Map<string, { movie: ScreeningFull["movie"]; count: number }>();
    list
      .filter((s) => cityId === "all" || s.hall.cinema.city_id === cityId)
      .filter((s) => cinemaId === "all" || s.hall.cinema.id === cinemaId)
      .filter(
        (s) =>
          genre === "all" ||
          (s.movie.genre ?? "")
            .split(",")
            .map((g) => normalize(g))
            .includes(normalize(genre)),
      )
      .filter(
        (s) =>
          !q ||
          normalize(s.movie.title).includes(q) ||
          normalize(s.movie.title_ar ?? "").includes(q) ||
          normalize(s.movie.genre ?? "").includes(q) ||
          normalize(s.hall.cinema.name).includes(q),
      )
      .forEach((s) => {
        const entry = grouped.get(s.movie.id);
        if (entry) entry.count += 1;
        else grouped.set(s.movie.id, { movie: s.movie, count: 1 });
      });
    return [...grouped.values()].sort((a, b) => a.movie.title.localeCompare(b.movie.title));
  }, [list, query, cityId, cinemaId, genre]);

  const activeFilters =
    (cityId !== "all" ? 1 : 0) + (cinemaId !== "all" ? 1 : 0) + (genre !== "all" ? 1 : 0);

  function resetFilters() {
    setCityId("all");
    setCinemaId("all");
    setGenre("all");
    setQuery("");
  }

  return (
    <div className="min-h-screen pb-24">
      <AppHeader
        right={
          <Select
            value={cityId}
            onValueChange={(v) => {
              setCityId(v);
              setCinemaId("all");
            }}
          >
            <SelectTrigger className="w-[150px] rounded-full border-border bg-card">
              <MapPin className="size-4 text-primary" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.allCities}</SelectItem>
              {(cities.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <main className="mx-auto max-w-3xl px-4">
        <section className="hero-fade -mx-4 px-4 pb-4 pt-6">
          <h1 className="text-2xl font-bold tracking-tight">
            {t.home.title} <span className="text-primary">en Algérie</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.home.subtitle}</p>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.home.search}
              className="rounded-full border-border bg-card pl-9 pr-9"
              aria-label={t.home.search}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
            >
              <SlidersHorizontal className="size-4 text-primary" />
              {t.home.filters}
              {activeFilters > 0 && (
                <Badge className="ml-1 rounded-full px-1.5 py-0 text-[10px]">{activeFilters}</Badge>
              )}
            </Button>
            {(activeFilters > 0 || query) && (
              <Button
                type="button"
                variant="ghost"
                className="rounded-full text-muted-foreground"
                onClick={resetFilters}
              >
                {t.home.resetFilters}
              </Button>
            )}
          </div>

          {showFilters && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Select value={cinemaId} onValueChange={setCinemaId}>
                <SelectTrigger className="rounded-full border-border bg-card">
                  <Film className="size-4 text-primary" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.common.allCinemas}</SelectItem>
                  {cinemaOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={genre} onValueChange={setGenre}>
                <SelectTrigger className="rounded-full border-border bg-card">
                  <Tag className="size-4 text-primary" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.home.allGenres}</SelectItem>
                  {genreOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </section>

        <section className="mt-2 space-y-3">
          {screenings.isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)}

          {!screenings.isLoading && movies.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {movies.length} {t.home.results}
              {movies.length > 1 ? "s" : ""}
            </p>
          )}

          {!screenings.isLoading && movies.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">{t.home.empty}</p>
          )}

          {movies.map(({ movie, count }) => (
            <Link
              key={movie.id}
              to="/film/$movieId"
              params={{ movieId: movie.id }}
              className="group flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50"
            >
              <MoviePoster
                src={movie.poster_url}
                alt={`Affiche du film ${movie.title}`}
                className="h-32 w-22 shrink-0 rounded-xl transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="min-w-0 flex-1 py-0.5">
                <h2 className="truncate font-semibold leading-tight">{movie.title}</h2>
                {movie.title_ar && (
                  <p dir="rtl" className="truncate text-sm text-muted-foreground">
                    {movie.title_ar}
                  </p>
                )}
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {movie.duration_minutes} {t.common.minutes}
                  </span>
                  {movie.age_rating && <span>{movie.age_rating}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(movie.genre ?? "")
                    .split(",")
                    .map((g) => g.trim())
                    .filter(Boolean)
                    .map((g) => (
                      <Badge key={g} variant="secondary" className="rounded-full text-[11px] font-normal">
                        {g}
                      </Badge>
                    ))}
                </div>
                <p className="mt-2 text-xs font-medium text-primary">
                  {count} séance{count > 1 ? "s" : ""} disponible{count > 1 ? "s" : ""}
                </p>
              </div>
            </Link>
          ))}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
