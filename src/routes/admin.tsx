import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, ImageUp, Plus, Trash2, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { MoviePoster } from "@/components/MoviePoster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
  assignRole,
  createCinema,
  createCity,
  createHall,
  fetchCinemas,
  fetchCities,
  fetchMovies,
  fetchScreeningsByStatus,
  fetchTeam,
  loadDemoData,
  removeStaff,
  revokeRole,
  setScreeningStatus,
  uploadPoster,
  upsertMovie,
  type AppRole,
} from "@/lib/api";
import { useI18n, type I18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";
import { resizeImageToBase64 } from "@/lib/image";

export const Route = createFileRoute("/admin")({
  head: pageHead("admin", { noindex: true }),
  component: Admin,
});

const grantableRoles: AppRole[] = ["contributeur", "agent_guichet", "admin"];

// Exécute une action et affiche le résultat ou l'erreur traduite.
function useRun() {
  const { error } = useI18n();
  return async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      return true;
    } catch (e) {
      toast.error(error(e));
      return false;
    }
  };
}

function Admin() {
  const { isAdmin, loading } = useAuth();
  const { t } = useI18n();

  if (!loading && !isAdmin) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t.common.restricted.admin}</p>
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
        <h1 className="text-2xl font-bold tracking-tight">{t.admin.title}</h1>

        {isAdmin && (
          <Tabs defaultValue="queue" className="mt-5">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="queue">{t.admin.tabs.queue}</TabsTrigger>
              <TabsTrigger value="movies">{t.admin.tabs.movies}</TabsTrigger>
              <TabsTrigger value="venues">{t.admin.tabs.venues}</TabsTrigger>
              <TabsTrigger value="team">{t.admin.tabs.team}</TabsTrigger>
            </TabsList>
            <TabsContent value="queue" className="mt-4">
              <QueueTab />
            </TabsContent>
            <TabsContent value="movies" className="mt-4">
              <MoviesTab />
            </TabsContent>
            <TabsContent value="venues" className="mt-4">
              <VenuesTab />
            </TabsContent>
            <TabsContent value="team" className="mt-4">
              <TeamTab />
            </TabsContent>
          </Tabs>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">{children}</h2>;
}

function Field({
  id,
  label,
  children,
  wide,
}: {
  id?: string;
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------- Validation */

function QueueTab() {
  const { t, date, title } = useI18n();
  const run = useRun();
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: ["screenings", "en_revue"],
    queryFn: () => fetchScreeningsByStatus({ data: "en_revue" }),
  });

  async function publish(ids: string[]) {
    if (!ids.length) return;
    const ok = await run(
      () => setScreeningStatus({ data: { ids, status: "publie" } }),
      t.admin.published,
    );
    if (ok) await queryClient.invalidateQueries({ queryKey: ["screenings"] });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>{t.admin.queue}</SectionTitle>
        <Button
          size="sm"
          className="rounded-xl"
          onClick={() => void publish((queue.data ?? []).map((s) => s.id))}
        >
          <CheckCheck className="size-4" />
          {t.admin.publish}
        </Button>
      </div>
      {queue.isLoading && <Skeleton className="mt-3 h-20 rounded-xl" />}
      {queue.data?.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">{t.admin.emptyQueue}</p>
      )}
      <div className="mt-3 space-y-2">
        {(queue.data ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{title(s.movie)}</p>
              <p className="text-xs text-muted-foreground">
                {s.hall.cinema.name} · {s.hall.name} · {date(s.starts_at, "medium")} · {s.price}{" "}
                {t.common.da}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => void publish([s.id])}
            >
              {t.admin.publish}
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Films */

const emptyMovie = {
  title: "",
  title_ar: "",
  title_en: "",
  duration_minutes: "120",
  genre: "",
  synopsis: "",
  synopsis_ar: "",
  synopsis_en: "",
  poster_url: "",
  trailer_url: "",
  age_rating: "",
};
type MovieForm = typeof emptyMovie;

function PosterField({
  value,
  onChange,
  t,
}: {
  value: string;
  onChange: (url: string) => void;
  t: I18n["t"];
}) {
  const { error } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const f = t.admin.movieForm;

  async function upload(file: File) {
    setBusy(true);
    try {
      const { url } = await uploadPoster({ data: await resizeImageToBase64(file) });
      onChange(url);
      toast.success(f.uploaded);
    } catch (e) {
      toast.error(error(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex gap-3">
      <MoviePoster
        src={value || null}
        alt={f.poster}
        className="h-28 w-20 shrink-0 rounded-lg border border-border"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImageUp className="size-4" />
            {busy ? f.uploading : f.upload}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl text-muted-foreground"
              onClick={() => onChange("")}
            >
              <Trash2 className="size-4" />
              {f.removePoster}
            </Button>
          )}
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.posterUrl}
          aria-label={f.posterUrl}
          dir="ltr"
          className="rounded-xl text-xs"
        />
      </div>
    </div>
  );
}

function MoviesTab() {
  const { t, title } = useI18n();
  const run = useRun();
  const queryClient = useQueryClient();
  const movies = useQuery({ queryKey: ["movies"], queryFn: () => fetchMovies() });
  const [form, setForm] = useState<MovieForm>(emptyMovie);
  const [editing, setEditing] = useState<string | null>(null);
  const f = t.admin.movieForm;
  const set = (k: keyof MovieForm) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  async function save() {
    if (!form.title.trim()) return;
    const ok = await run(
      () =>
        upsertMovie({
          data: {
            ...(editing ? { id: editing } : {}),
            ...form,
            duration_minutes: Number(form.duration_minutes),
          },
        }),
      editing ? f.saved : f.added,
    );
    if (ok) {
      setForm(emptyMovie);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["movies"] });
      await queryClient.invalidateQueries({ queryKey: ["screenings"] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>{editing ? f.edit : f.new}</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={f.poster} wide>
            <PosterField
              value={form.poster_url}
              onChange={(url) => setForm((prev) => ({ ...prev, poster_url: url }))}
              t={t}
            />
          </Field>
          <Field id="title" label={f.title}>
            <Input
              id="title"
              dir="auto"
              value={form.title}
              onChange={set("title")}
              className="rounded-xl"
            />
          </Field>
          <Field id="title_ar" label={f.titleAr}>
            <Input
              id="title_ar"
              dir="rtl"
              value={form.title_ar}
              onChange={set("title_ar")}
              className="rounded-xl"
            />
          </Field>
          <Field id="title_en" label={f.titleEn}>
            <Input
              id="title_en"
              dir="ltr"
              value={form.title_en}
              onChange={set("title_en")}
              className="rounded-xl"
            />
          </Field>
          <Field id="dur" label={f.duration}>
            <Input
              id="dur"
              type="number"
              min={1}
              max={600}
              value={form.duration_minutes}
              onChange={set("duration_minutes")}
              className="rounded-xl"
            />
          </Field>
          <Field id="genre" label={f.genres}>
            <Input
              id="genre"
              value={form.genre}
              onChange={set("genre")}
              placeholder={f.genresHint}
              className="rounded-xl"
            />
          </Field>
          <Field id="age" label={f.rating}>
            <Input
              id="age"
              value={form.age_rating}
              onChange={set("age_rating")}
              placeholder={f.ratingHint}
              className="rounded-xl"
            />
          </Field>
          <Field id="trailer" label={f.trailer} wide>
            <Input
              id="trailer"
              dir="ltr"
              value={form.trailer_url}
              onChange={set("trailer_url")}
              className="rounded-xl"
            />
          </Field>
          <Field id="syn" label={f.synopsis} wide>
            <Textarea
              id="syn"
              dir="auto"
              value={form.synopsis}
              onChange={set("synopsis")}
              className="rounded-xl"
            />
          </Field>
          <Field id="syn_ar" label={f.synopsisAr} wide>
            <Textarea
              id="syn_ar"
              dir="rtl"
              value={form.synopsis_ar}
              onChange={set("synopsis_ar")}
              className="rounded-xl"
            />
          </Field>
          <Field id="syn_en" label={f.synopsisEn} wide>
            <Textarea
              id="syn_en"
              dir="ltr"
              value={form.synopsis_en}
              onChange={set("synopsis_en")}
              className="rounded-xl"
            />
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          {editing && (
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => {
                setEditing(null);
                setForm(emptyMovie);
              }}
            >
              {t.common.cancel}
            </Button>
          )}
          <Button className="flex-1 rounded-xl" onClick={() => void save()}>
            <Plus className="size-4" />
            {editing ? t.common.save : t.common.add}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {(movies.data ?? []).map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <MoviePoster
                src={m.poster_url}
                alt={t.common.posterOf(title(m))}
                className="h-12 w-9 shrink-0 rounded"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{title(m)}</p>
                <p className="text-xs text-muted-foreground">
                  {m.duration_minutes} {t.common.minutes} · {m.genre ?? "—"}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setEditing(m.id);
                setForm({
                  title: m.title,
                  title_ar: m.title_ar ?? "",
                  title_en: m.title_en ?? "",
                  duration_minutes: String(m.duration_minutes),
                  genre: m.genre ?? "",
                  synopsis: m.synopsis ?? "",
                  synopsis_ar: m.synopsis_ar ?? "",
                  synopsis_en: m.synopsis_en ?? "",
                  poster_url: m.poster_url ?? "",
                  trailer_url: m.trailer_url ?? "",
                  age_rating: m.age_rating ?? "",
                });
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              {t.common.edit}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Lieux */

function VenuesTab() {
  const { t, city: cityName } = useI18n();
  const run = useRun();
  const v = t.admin.venues;
  const queryClient = useQueryClient();
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => fetchCities() });
  const cinemas = useQuery({ queryKey: ["cinemas"], queryFn: () => fetchCinemas() });
  const [city, setCity] = useState("");
  const [cinema, setCinema] = useState({
    name: "",
    city_id: "",
    address: "",
    phone: "",
    coords: "",
    description: "",
  });
  const [hall, setHall] = useState({
    cinema_id: "",
    name: "",
    capacity: "100",
    type: "standard" as "standard" | "vip",
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cities"] }),
      queryClient.invalidateQueries({ queryKey: ["cinemas"] }),
    ]);

  async function loadDemo() {
    if (!window.confirm(t.admin.demo.confirm)) return;
    const ok = await run(async () => {
      const { screeningsAdded } = await loadDemoData();
      toast.info(t.admin.demo.added(screeningsAdded));
    }, t.admin.demo.done);
    if (ok) await queryClient.invalidateQueries();
  }

  async function addCity() {
    if (!city.trim()) return;
    if (await run(() => createCity({ data: city }), v.cityAdded)) {
      setCity("");
      await refresh();
    }
  }

  async function addCinema() {
    if (!cinema.name.trim() || !cinema.city_id) return void toast.error(v.required);
    // Coordonnées au format « 36.7538, 3.0588 » (copiées depuis Google Maps).
    const [lat, lng] = cinema.coords.split(",").map((x) => Number(x.trim()));
    const hasCoords = cinema.coords.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng);
    if (cinema.coords.trim() && !hasCoords) return void toast.error(v.badCoords);
    const ok = await run(
      () =>
        createCinema({
          data: {
            name: cinema.name,
            city_id: cinema.city_id,
            address: cinema.address,
            phone: cinema.phone,
            description: cinema.description,
            latitude: hasCoords ? lat! : null,
            longitude: hasCoords ? lng! : null,
          },
        }),
      v.cinemaAdded,
    );
    if (ok) {
      setCinema({ name: "", city_id: "", address: "", phone: "", coords: "", description: "" });
      await refresh();
    }
  }

  async function addHall() {
    if (!hall.cinema_id || !hall.name.trim()) return void toast.error(v.hallRequired);
    const ok = await run(
      () =>
        createHall({
          data: {
            cinema_id: hall.cinema_id,
            name: hall.name,
            capacity: Number(hall.capacity),
            type: hall.type,
          },
        }),
      v.hallAdded,
    );
    if (ok) {
      setHall({ ...hall, name: "" });
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-border bg-card p-4">
        <SectionTitle>{t.admin.demo.title}</SectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">{t.admin.demo.text}</p>
        <Button
          variant="outline"
          className="mt-3 w-full rounded-xl"
          onClick={() => void loadDemo()}
        >
          {t.admin.demo.button}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>{v.newCity}</SectionTitle>
        <div className="mt-3 flex gap-2">
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={v.cityHint}
            aria-label={v.newCity}
            className="rounded-xl"
          />
          <Button className="rounded-xl" onClick={() => void addCity()}>
            {t.common.add}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>{v.newCinema}</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="cname" label={v.name}>
            <Input
              id="cname"
              value={cinema.name}
              onChange={(e) => setCinema({ ...cinema, name: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label={v.city}>
            <Select
              value={cinema.city_id}
              onValueChange={(x) => setCinema({ ...cinema, city_id: x })}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={t.common.choose} />
              </SelectTrigger>
              <SelectContent>
                {(cities.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {cityName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="caddr" label={v.address}>
            <Input
              id="caddr"
              value={cinema.address}
              onChange={(e) => setCinema({ ...cinema, address: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field id="cphone" label={v.phone}>
            <Input
              id="cphone"
              dir="ltr"
              value={cinema.phone}
              onChange={(e) => setCinema({ ...cinema, phone: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field id="ccoords" label={v.coords} wide>
            <Input
              id="ccoords"
              dir="ltr"
              value={cinema.coords}
              onChange={(e) => setCinema({ ...cinema, coords: e.target.value })}
              placeholder="36.7538, 3.0588"
              className="rounded-xl"
            />
          </Field>
          <Field id="cdesc" label={v.description} wide>
            <Textarea
              id="cdesc"
              value={cinema.description}
              onChange={(e) => setCinema({ ...cinema, description: e.target.value })}
              className="rounded-xl"
            />
          </Field>
        </div>
        <Button className="mt-4 w-full rounded-xl" onClick={() => void addCinema()}>
          <Plus className="size-4" />
          {t.common.add}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>{v.newHall}</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={v.cinema}>
            <Select
              value={hall.cinema_id}
              onValueChange={(x) => setHall({ ...hall, cinema_id: x })}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={t.common.choose} />
              </SelectTrigger>
              <SelectContent>
                {(cinemas.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="hname" label={v.hallName}>
            <Input
              id="hname"
              value={hall.name}
              onChange={(e) => setHall({ ...hall, name: e.target.value })}
              placeholder={v.hallHint}
              className="rounded-xl"
            />
          </Field>
          <Field id="hcap" label={v.capacity}>
            <Input
              id="hcap"
              type="number"
              min={1}
              max={260}
              value={hall.capacity}
              onChange={(e) => setHall({ ...hall, capacity: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label={v.type}>
            <Select
              value={hall.type}
              onValueChange={(x) => setHall({ ...hall, type: x as "standard" | "vip" })}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Button className="mt-4 w-full rounded-xl" onClick={() => void addHall()}>
          <Plus className="size-4" />
          {t.common.add}
        </Button>
      </div>

      <div className="space-y-2">
        {(cinemas.data ?? []).map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-medium">
              {c.name}{" "}
              <span className="text-muted-foreground">· {c.city ? cityName(c.city) : ""}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {c.halls.length
                ? c.halls.map((h) => `${h.name} (${h.capacity})`).join(" · ")
                : v.noHall}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Équipe */

function TeamTab() {
  const { t } = useI18n();
  const run = useRun();
  const tm = t.admin.team;
  const queryClient = useQueryClient();
  const cinemas = useQuery({ queryKey: ["cinemas"], queryFn: () => fetchCinemas() });
  const team = useQuery({ queryKey: ["team"], queryFn: () => fetchTeam() });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("agent_guichet");
  const [cinemaId, setCinemaId] = useState("");
  const needsCinema = role === "contributeur" || role === "agent_guichet";

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team"] });

  async function grant() {
    if (!email.trim()) return;
    const ok = await run(
      () =>
        assignRole({
          data: { email, role, ...(needsCinema && cinemaId ? { cinemaId } : {}) },
        }),
      tm.granted,
    );
    if (ok) {
      setEmail("");
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>{tm.grant}</SectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">{tm.hint}</p>
        <div className="mt-3 space-y-3">
          <Field id="remail" label={tm.email}>
            <Input
              id="remail"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl"
            />
          </Field>
          <Field label={tm.role}>
            <Select value={role} onValueChange={(x) => setRole(x as AppRole)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {grantableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t.roles[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {needsCinema && (
            <Field label={tm.cinema}>
              <Select value={cinemaId} onValueChange={setCinemaId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={tm.chooseCinema} />
                </SelectTrigger>
                <SelectContent>
                  {(cinemas.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Button className="w-full rounded-xl" onClick={() => void grant()}>
            {tm.submit}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {team.isLoading && <Skeleton className="h-16 rounded-xl" />}
        {(team.data ?? []).map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-medium" dir="ltr">
              {m.email}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.roles.map((r) => (
                <Badge key={r} variant="secondary" className="gap-1 rounded-full">
                  {t.roles[r]}
                  <button
                    type="button"
                    aria-label={tm.removeRole(t.roles[r])}
                    onClick={async () => {
                      if (
                        await run(() => revokeRole({ data: { userId: m.id, role: r } }), tm.revoked)
                      )
                        await refresh();
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {m.cinemas.map((c) => (
                <Badge key={c.id} variant="outline" className="gap-1 rounded-full">
                  {c.name}
                  <button
                    type="button"
                    aria-label={tm.removeCinema(c.name)}
                    onClick={async () => {
                      if (
                        await run(
                          () => removeStaff({ data: { userId: m.id, cinemaId: c.id } }),
                          tm.unlinked,
                        )
                      )
                        await refresh();
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
