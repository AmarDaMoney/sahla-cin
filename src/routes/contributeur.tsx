import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Send, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  createScreening,
  deleteScreening,
  fetchMovies,
  fetchMyStaffCinemas,
  fetchScreeningsForCinema,
  setScreeningStatus,
  type AudioLanguage,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";

export const Route = createFileRoute("/contributeur")({
  head: pageHead("contributor", { noindex: true }),
  component: Contributor,
});

const languages: AudioLanguage[] = ["VO", "VF", "VOSTFR", "VOSTAR", "AR_DUB"];

function Contributor() {
  const { user, isContributor, loading } = useAuth();
  const { t, date, title, error } = useI18n();
  const queryClient = useQueryClient();
  const [cinemaId, setCinemaId] = useState<string>("");
  const [hallId, setHallId] = useState("");
  const [movieId, setMovieId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [price, setPrice] = useState("500");
  const [lang, setLang] = useState<AudioLanguage>("VOSTFR");

  const staff = useQuery({
    queryKey: ["staff-cinemas", user?.id],
    queryFn: () => fetchMyStaffCinemas(),
    enabled: !!user,
  });
  const cinemas = staff.data ?? [];
  const current = cinemas.find((c) => c.id === cinemaId) ?? cinemas[0];

  const movies = useQuery({ queryKey: ["movies"], queryFn: () => fetchMovies() });
  const screenings = useQuery({
    queryKey: ["cinema-screenings", current?.id],
    queryFn: () => fetchScreeningsForCinema({ data: current!.id }),
    enabled: !!current,
  });

  async function add() {
    if (!hallId || !movieId || !startsAt) {
      toast.error(t.contributor.incomplete);
      return;
    }
    try {
      // Heure saisie = heure d'Alger, convertie côté serveur.
      await createScreening({
        data: {
          hallId,
          movieId,
          startsAtLocal: startsAt,
          price: Number(price),
          audioLanguage: lang,
        },
      });
      toast.success(t.contributor.added);
      setStartsAt("");
      await queryClient.invalidateQueries({ queryKey: ["cinema-screenings"] });
    } catch (e) {
      toast.error(error(e));
    }
  }

  async function submitAll() {
    const drafts = (screenings.data ?? []).filter((s) => s.status === "brouillon").map((s) => s.id);
    if (!drafts.length) return;
    try {
      await setScreeningStatus({ data: { ids: drafts, status: "en_revue" } });
      toast.success(t.contributor.submitted);
      await queryClient.invalidateQueries({ queryKey: ["cinema-screenings"] });
    } catch (e) {
      toast.error(error(e));
    }
  }

  if (!loading && !isContributor) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t.common.restricted.contributor}</p>
          <Button asChild className="mt-4 rounded-xl">
            <Link to="/compte">{t.nav.account}</Link>
          </Button>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.contributor.title}</h1>

        {staff.isLoading && <Skeleton className="mt-4 h-24 rounded-2xl" />}
        {!staff.isLoading && cinemas.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">{t.contributor.noCinema}</p>
        )}

        {current && (
          <>
            {cinemas.length > 1 && (
              <Select value={current.id} onValueChange={setCinemaId}>
                <SelectTrigger className="mt-4 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cinemas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <section className="mt-5 rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                {t.contributor.addScreening}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t.contributor.hall}</Label>
                  <Select value={hallId} onValueChange={setHallId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={t.contributor.chooseHall} />
                    </SelectTrigger>
                    <SelectContent>
                      {current.halls.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t.contributor.movie}</Label>
                  <Select value={movieId} onValueChange={setMovieId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder={t.contributor.chooseMovie} />
                    </SelectTrigger>
                    <SelectContent>
                      {(movies.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {title(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="starts">{t.contributor.dateTime}</Label>
                  <Input
                    id="starts"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price">
                    {t.common.price} ({t.common.da})
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t.contributor.version}</Label>
                  <Select value={lang} onValueChange={(v) => setLang(v as AudioLanguage)}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((l) => (
                        <SelectItem key={l} value={l}>
                          {t.languages[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="mt-4 w-full rounded-xl" onClick={add}>
                <Plus className="size-4" />
                {t.common.add}
              </Button>
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                  {t.contributor.week}
                </h2>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={submitAll}>
                  <Send className="size-4" />
                  {t.contributor.submit}
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {(screenings.data ?? []).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{title(s.movie)}</p>
                      <p className="text-xs text-muted-foreground">
                        {date(s.starts_at, "medium")} · {s.hall.name} ·{" "}
                        {t.languages[s.audio_language]} · {s.price} {t.common.da}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={s.status === "publie" ? "default" : "secondary"}>
                        {t.status[s.status]}
                      </Badge>
                      {s.status !== "publie" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t.common.delete}
                          onClick={async () => {
                            try {
                              await deleteScreening({ data: s.id });
                              await queryClient.invalidateQueries({
                                queryKey: ["cinema-screenings"],
                              });
                            } catch (e) {
                              toast.error(error(e));
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {screenings.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t.contributor.empty}</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
