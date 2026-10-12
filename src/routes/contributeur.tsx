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
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/contributeur")({
  head: () => ({
    meta: [
      { title: "Espace contributeur — BookCinéDZ" },
      {
        name: "description",
        content: "Saisissez le programme hebdomadaire de votre cinéma et soumettez-le à validation.",
      },
      { property: "og:title", content: "Espace contributeur — BookCinéDZ" },
      { property: "og:description", content: "Gestion du programme d'un cinéma partenaire." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Contributor,
});

const languages: AudioLanguage[] = ["VO", "VF", "VOSTFR", "VOSTAR", "AR_DUB"];
const fmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

type StaffCinema = { id: string; name: string; halls: { id: string; name: string }[] };

function Contributor() {
  const { user, isContributor, loading } = useAuth();
  const queryClient = useQueryClient();
  const [cinemaId, setCinemaId] = useState<string>("");
  const [hallId, setHallId] = useState("");
  const [movieId, setMovieId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [price, setPrice] = useState("500");
  const [lang, setLang] = useState<AudioLanguage>("VOSTFR");

  const staff = useQuery({
    queryKey: ["staff-cinemas", user?.id],
    queryFn: fetchMyStaffCinemas,
    enabled: !!user,
  });
  const cinemas = ((staff.data ?? []) as unknown as { cinema: StaffCinema | null }[])
    .map((r) => r.cinema)
    .filter((c): c is StaffCinema => !!c);
  const current = cinemas.find((c) => c.id === cinemaId) ?? cinemas[0];

  const movies = useQuery({ queryKey: ["movies"], queryFn: fetchMovies });
  const screenings = useQuery({
    queryKey: ["cinema-screenings", current?.id],
    queryFn: () => fetchScreeningsForCinema(current!.id),
    enabled: !!current,
  });

  async function add() {
    if (!hallId || !movieId || !startsAt) {
      toast.error("Complétez la salle, le film et l'horaire.");
      return;
    }
    try {
      await createScreening({
        hallId,
        movieId,
        startsAt: new Date(startsAt).toISOString(),
        price: Number(price),
        audioLanguage: lang,
      });
      toast.success("Séance ajoutée en brouillon");
      setStartsAt("");
      await queryClient.invalidateQueries({ queryKey: ["cinema-screenings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function submitAll() {
    const drafts = (screenings.data ?? []).filter((s) => s.status === "brouillon").map((s) => s.id);
    if (!drafts.length) return;
    try {
      await setScreeningStatus(drafts, "en_revue");
      toast.success(t.contributor.submitted);
      await queryClient.invalidateQueries({ queryKey: ["cinema-screenings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (!loading && !isContributor) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Cet espace est réservé aux contributeurs des cinémas partenaires.
          </p>
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
                  <Label>Salle</Label>
                  <Select value={hallId} onValueChange={setHallId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Choisir une salle" />
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
                  <Label>Film</Label>
                  <Select value={movieId} onValueChange={setMovieId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Choisir un film" />
                    </SelectTrigger>
                    <SelectContent>
                      {(movies.data ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="starts">Date & heure</Label>
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
                  <Label>Version</Label>
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
                      <p className="truncate text-sm font-medium">{s.movie.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt.format(new Date(s.starts_at))} · {s.hall.name} ·{" "}
                        {t.languages[s.audio_language]} · {s.price} {t.common.da}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={s.status === "publie" ? "default" : "secondary"}>
                        {s.status === "publie"
                          ? "Publié"
                          : s.status === "en_revue"
                            ? "En revue"
                            : "Brouillon"}
                      </Badge>
                      {s.status !== "publie" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t.common.delete}
                          onClick={async () => {
                            await deleteScreening(s.id);
                            await queryClient.invalidateQueries({ queryKey: ["cinema-screenings"] });
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {screenings.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aucune séance pour l'instant.</p>
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
