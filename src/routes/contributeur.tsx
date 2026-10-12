import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Copy, Download, FileUp, Plus, Send, Trash2, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  copyWeek,
  createScreeningBatch,
  deleteScreening,
  fetchMovies,
  fetchMyStaffCinemas,
  fetchScreeningsForCinema,
  importProgrammeCsv,
  setScreeningStatus,
  type AudioLanguage,
} from "@/lib/api";
import { useI18n, type I18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";

export const Route = createFileRoute("/contributeur")({
  head: pageHead("contributor", { noindex: true }),
  component: Contributor,
});

const LANGUAGES: AudioLanguage[] = ["VO", "VF", "VOSTFR", "VOSTAR", "AR_DUB"];
const DAY = 24 * 60 * 60_000;

// Date du jour à Alger (AAAA-MM-JJ), décalée de n jours.
function algiersDate(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers" }).format(
    new Date(Date.now() + offsetDays * DAY),
  );
}

// Jours entre deux dates incluses, filtrés par jour de semaine (0 = lundi).
function datesBetween(from: string, to: string, weekdays: Set<number>) {
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`).getTime();
  for (let d = new Date(`${from}T12:00:00Z`).getTime(); d <= end && out.length < 62; d += DAY) {
    const day = (new Date(d).getUTCDay() + 6) % 7;
    if (weekdays.has(day)) out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

type Cinema = { id: string; name: string; halls: { id: string; name: string }[] };
type MovieOption = { id: string; title: string; title_ar: string | null; title_en: string | null };

function Contributor() {
  const { user, isContributor, loading } = useAuth();
  const { t, date, title, error } = useI18n();
  const queryClient = useQueryClient();
  const [cinemaId, setCinemaId] = useState<string>("");

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
  const upcoming = (screenings.data ?? []).filter(
    (s) => new Date(s.starts_at).getTime() > Date.now() - 3 * 60 * 60_000,
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["cinema-screenings"] });

  async function submitAll() {
    const drafts = upcoming.filter((s) => s.status === "brouillon").map((s) => s.id);
    if (!drafts.length) return;
    try {
      await setScreeningStatus({ data: { ids: drafts, status: "en_revue" } });
      toast.success(t.contributor.submitted);
      await refresh();
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
              <Tabs defaultValue="batch" className="mt-3">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="batch">{t.contributor.tools.single}</TabsTrigger>
                  <TabsTrigger value="copy">{t.contributor.tools.copy}</TabsTrigger>
                  <TabsTrigger value="csv">{t.contributor.tools.csv}</TabsTrigger>
                </TabsList>
                <TabsContent value="batch" className="mt-4">
                  <BatchForm cinema={current} movies={movies.data ?? []} onDone={refresh} />
                </TabsContent>
                <TabsContent value="copy" className="mt-4">
                  <CopyWeekForm cinemaId={current.id} onDone={refresh} />
                </TabsContent>
                <TabsContent value="csv" className="mt-4">
                  <CsvImport cinema={current} movies={movies.data ?? []} onDone={refresh} />
                </TabsContent>
              </Tabs>
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                  {t.contributor.tools.upcoming}
                </h2>
                <Button size="sm" variant="outline" className="rounded-xl" onClick={submitAll}>
                  <Send className="size-4" />
                  {t.contributor.submit}
                </Button>
              </div>

              <div className="mt-3 space-y-2">
                {upcoming.map((s) => (
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
                              await refresh();
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
                {screenings.data && upcoming.length === 0 && (
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

function lineErrors(errors: { line: number; code: string }[], i18n: I18n, csv = false) {
  const { t } = i18n;
  return errors.map((e) =>
    (csv ? t.contributor.tools.csvLine : t.contributor.tools.lineError)(
      e.line,
      t.errors[e.code] ?? e.code,
    ),
  );
}

/* --------------------------------------------- Plusieurs jours × horaires */

function BatchForm({
  cinema,
  movies,
  onDone,
}: {
  cinema: Cinema;
  movies: MovieOption[];
  onDone: () => Promise<unknown>;
}) {
  const i18n = useI18n();
  const { t, title, error } = i18n;
  const tl = t.contributor.tools;
  const [hallId, setHallId] = useState("");
  const [movieId, setMovieId] = useState("");
  const [price, setPrice] = useState("500");
  const [lang, setLang] = useState<AudioLanguage>("VOSTFR");
  const [from, setFrom] = useState(algiersDate(1));
  const [to, setTo] = useState(algiersDate(7));
  const [weekdays, setWeekdays] = useState(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [times, setTimes] = useState<string[]>([]);
  const [time, setTime] = useState("20:00");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const dates = useMemo(
    () => (from && to && from <= to ? datesBetween(from, to, weekdays) : []),
    [from, to, weekdays],
  );
  const count = dates.length * times.length;

  function addTime() {
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time) && !times.includes(time)) {
      setTimes([...times, time].sort());
    }
  }

  async function create() {
    setProblems([]);
    if (!hallId || !movieId || !count) return void toast.error(t.contributor.incomplete);
    setBusy(true);
    try {
      const res = await createScreeningBatch({
        data: { hallId, movieId, price: Number(price), audioLanguage: lang, dates, times },
      });
      if (res.errors.length) {
        setProblems(lineErrors(res.errors, i18n));
        return;
      }
      toast.success(tl.created(res.created));
      setTimes([]);
      await onDone();
    } catch (e) {
      toast.error(error(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t.contributor.hall}</Label>
          <Select value={hallId} onValueChange={setHallId}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={t.contributor.chooseHall} />
            </SelectTrigger>
            <SelectContent>
              {cinema.halls.map((h) => (
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
              {movies.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {title(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t.contributor.version}</Label>
          <Select value={lang} onValueChange={(v) => setLang(v as AudioLanguage)}>
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l} value={l}>
                  {t.languages[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Label htmlFor="from">{tl.from}</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">{tl.to}</Label>
          <Input
            id="to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{tl.days}</Label>
        <div className="flex flex-wrap gap-1.5">
          {tl.weekdays.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={weekdays.has(i)}
              onClick={() => {
                const next = new Set(weekdays);
                if (next.has(i)) next.delete(i);
                else next.add(i);
                setWeekdays(next);
              }}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                weekdays.has(i)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="time">{tl.times}</Label>
        <div className="flex gap-2">
          <Input
            id="time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-32 rounded-xl"
            dir="ltr"
          />
          <Button type="button" variant="outline" className="rounded-xl" onClick={addTime}>
            <Plus className="size-4" />
            {tl.addTime}
          </Button>
        </div>
        {times.length === 0 ? (
          <p className="text-xs text-muted-foreground">{tl.timesHint}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" dir="ltr">
            {times.map((tm) => (
              <Badge key={tm} variant="secondary" className="gap-1 rounded-full">
                {tm}
                <button
                  type="button"
                  aria-label={`${t.common.delete} ${tm}`}
                  onClick={() => setTimes(times.filter((x) => x !== tm))}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {problems.length > 0 && <ProblemList items={problems} />}

      <Button className="w-full rounded-xl" disabled={busy || !count} onClick={() => void create()}>
        <CalendarPlus className="size-4" />
        {count ? `${tl.create} — ${tl.willCreate(count)}` : tl.create}
      </Button>
    </div>
  );
}

function ProblemList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive-foreground">
      {items.slice(0, 20).map((p) => (
        <li key={p}>• {p}</li>
      ))}
      {items.length > 20 && <li>…</li>}
    </ul>
  );
}

/* ------------------------------------------------------ Copier une semaine */

function CopyWeekForm({ cinemaId, onDone }: { cinemaId: string; onDone: () => Promise<unknown> }) {
  const { t, error } = useI18n();
  const tl = t.contributor.tools;
  const [from, setFrom] = useState(algiersDate(0));
  const [busy, setBusy] = useState(false);

  async function copy() {
    setBusy(true);
    try {
      const res = await copyWeek({ data: { cinemaId, fromDate: from } });
      toast.success(tl.copied(res.created, res.skipped));
      await onDone();
    } catch (e) {
      toast.error(error(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{tl.copyHint}</p>
      <div className="space-y-1.5">
        <Label htmlFor="copy-from">{tl.copyFrom}</Label>
        <Input
          id="copy-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-48 rounded-xl"
        />
      </div>
      <Button className="w-full rounded-xl" disabled={busy || !from} onClick={() => void copy()}>
        <Copy className="size-4" />
        {tl.copyButton}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------- CSV */

function CsvImport({
  cinema,
  movies,
  onDone,
}: {
  cinema: Cinema;
  movies: MovieOption[];
  onDone: () => Promise<unknown>;
}) {
  const i18n = useI18n();
  const { t, date, error } = i18n;
  const tl = t.contributor.tools;
  const file = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importProgrammeCsv>> | null>(null);

  function downloadTemplate() {
    const hall = cinema.halls[0]?.name ?? "Salle 1";
    const film = movies[0]?.title ?? "Titre du film";
    const content = [
      "date;heure;salle;film;version;prix",
      `${algiersDate(1)};14:00;${hall};${film};VF;500`,
      `${algiersDate(1)};20:30;${hall};${film};VOSTFR;600`,
    ].join("\r\n");
    // BOM : Excel ouvre ainsi correctement les accents et l'arabe.
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "programme.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function run(dryRun: boolean) {
    if (!csv.trim()) return;
    setBusy(true);
    try {
      const res = await importProgrammeCsv({ data: { cinemaId: cinema.id, csv, dryRun } });
      setResult(res);
      if (!dryRun && !res.errors.length) {
        toast.success(tl.created(res.created));
        setCsv("");
        setResult(null);
        await onDone();
      }
    } catch (e) {
      toast.error(error(e));
    } finally {
      setBusy(false);
    }
  }

  const ready = result && !result.errors.length ? result.preview.length : 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{tl.csvHint}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={downloadTemplate}
        >
          <Download className="size-4" />
          {tl.template}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl"
          onClick={() => file.current?.click()}
        >
          <FileUp className="size-4" />
          {tl.chooseFile}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCsv(await f.text());
              setResult(null);
            }
            e.target.value = "";
          }}
        />
      </div>
      <Textarea
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setResult(null);
        }}
        placeholder="date;heure;salle;film;version;prix"
        dir="ltr"
        rows={6}
        className="rounded-xl font-mono text-xs"
      />

      {result && result.errors.length > 0 && (
        <ProblemList items={lineErrors(result.errors, i18n, true)} />
      )}
      {ready > 0 && (
        <div className="rounded-xl border border-border p-3 text-xs">
          <p className="font-medium text-primary">{tl.csvReady(ready)}</p>
          <ul className="mt-2 space-y-0.5 text-muted-foreground">
            {result!.preview.slice(0, 10).map((p) => (
              <li key={p.line}>
                {date(p.startsAt, "medium")} · {p.hall} · {p.film} · {t.languages[p.version]} ·{" "}
                {p.price} {t.common.da}
              </li>
            ))}
            {result!.preview.length > 10 && <li>…</li>}
          </ul>
        </div>
      )}

      {ready > 0 ? (
        <Button className="w-full rounded-xl" disabled={busy} onClick={() => void run(false)}>
          <FileUp className="size-4" />
          {tl.confirm(ready)}
        </Button>
      ) : (
        <Button
          className="w-full rounded-xl"
          variant="outline"
          disabled={busy || !csv.trim()}
          onClick={() => void run(true)}
        >
          {tl.check}
        </Button>
      )}
    </div>
  );
}
