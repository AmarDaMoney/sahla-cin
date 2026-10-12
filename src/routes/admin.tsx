import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Plus, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
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
  removeStaff,
  revokeRole,
  setScreeningStatus,
  upsertMovie,
  type AppRole,
} from "@/lib/api";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Espace administrateur — BookCinéDZ" },
      {
        name: "description",
        content:
          "Validez les programmes soumis, gérez le catalogue de films, les cinémas et les équipes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

const fmt = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Algiers",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const grantableRoles: AppRole[] = ["contributeur", "agent_guichet", "admin"];

// Exécute une action et affiche le résultat ou l'erreur.
async function run(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.success(success);
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Erreur");
    return false;
  }
}

function Admin() {
  const { isAdmin, loading } = useAuth();

  if (!loading && !isAdmin) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Cet espace est réservé aux administrateurs.
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
        <h1 className="text-2xl font-bold tracking-tight">{t.admin.title}</h1>

        {isAdmin && (
          <Tabs defaultValue="queue" className="mt-5">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="queue">Validation</TabsTrigger>
              <TabsTrigger value="movies">{t.admin.movies}</TabsTrigger>
              <TabsTrigger value="venues">Lieux</TabsTrigger>
              <TabsTrigger value="team">Équipe</TabsTrigger>
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
      <div className="flex items-center justify-between">
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
              <p className="truncate text-sm font-medium">{s.movie.title}</p>
              <p className="text-xs text-muted-foreground">
                {s.hall.cinema.name} · {s.hall.name} · {fmt.format(new Date(s.starts_at))} ·{" "}
                {s.price} {t.common.da}
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
  duration_minutes: "120",
  genre: "",
  synopsis: "",
  poster_url: "",
  trailer_url: "",
  age_rating: "",
};

function MoviesTab() {
  const queryClient = useQueryClient();
  const movies = useQuery({ queryKey: ["movies"], queryFn: () => fetchMovies() });
  const [form, setForm] = useState(emptyMovie);
  const [editing, setEditing] = useState<string | null>(null);
  const set = (k: keyof typeof emptyMovie) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  async function save() {
    if (!form.title.trim()) return;
    const ok = await run(
      () =>
        upsertMovie({
          data: {
            ...(editing ? { id: editing } : {}),
            title: form.title,
            title_ar: form.title_ar,
            duration_minutes: Number(form.duration_minutes),
            genre: form.genre,
            synopsis: form.synopsis,
            poster_url: form.poster_url,
            trailer_url: form.trailer_url,
            age_rating: form.age_rating,
          },
        }),
      editing ? "Film modifié" : "Film ajouté",
    );
    if (ok) {
      setForm(emptyMovie);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["movies"] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>{editing ? "Modifier le film" : "Nouveau film"}</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="title" label="Titre">
            <Input id="title" value={form.title} onChange={set("title")} className="rounded-xl" />
          </Field>
          <Field id="title_ar" label="Titre arabe">
            <Input
              id="title_ar"
              dir="rtl"
              value={form.title_ar}
              onChange={set("title_ar")}
              className="rounded-xl"
            />
          </Field>
          <Field id="dur" label="Durée (min)">
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
          <Field id="genre" label="Genres">
            <Input
              id="genre"
              value={form.genre}
              onChange={set("genre")}
              placeholder="Drame, Comédie"
              className="rounded-xl"
            />
          </Field>
          <Field id="age" label="Classification">
            <Input
              id="age"
              value={form.age_rating}
              onChange={set("age_rating")}
              placeholder="Tous publics"
              className="rounded-xl"
            />
          </Field>
          <Field id="poster" label="Affiche (URL https)">
            <Input
              id="poster"
              value={form.poster_url}
              onChange={set("poster_url")}
              className="rounded-xl"
            />
          </Field>
          <Field id="trailer" label="Bande-annonce (URL YouTube)" wide>
            <Input
              id="trailer"
              value={form.trailer_url}
              onChange={set("trailer_url")}
              className="rounded-xl"
            />
          </Field>
          <Field id="syn" label="Synopsis" wide>
            <Textarea
              id="syn"
              value={form.synopsis}
              onChange={set("synopsis")}
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
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.title}</p>
              <p className="text-xs text-muted-foreground">
                {m.duration_minutes} {t.common.minutes} · {m.genre ?? "—"}
              </p>
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
                  duration_minutes: String(m.duration_minutes),
                  genre: m.genre ?? "",
                  synopsis: m.synopsis ?? "",
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

  async function addCity() {
    if (!city.trim()) return;
    if (await run(() => createCity({ data: city }), "Ville ajoutée")) {
      setCity("");
      await refresh();
    }
  }

  async function addCinema() {
    if (!cinema.name.trim() || !cinema.city_id) {
      return void toast.error("Nom et ville obligatoires");
    }
    // Coordonnées au format « 36.7538, 3.0588 » (copiées depuis Google Maps).
    const [lat, lng] = cinema.coords.split(",").map((v) => Number(v.trim()));
    const hasCoords = cinema.coords.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng);
    if (cinema.coords.trim() && !hasCoords) return void toast.error("Coordonnées invalides");
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
      "Cinéma ajouté",
    );
    if (ok) {
      setCinema({ name: "", city_id: "", address: "", phone: "", coords: "", description: "" });
      await refresh();
    }
  }

  async function addHall() {
    if (!hall.cinema_id || !hall.name.trim()) return void toast.error("Cinéma et nom obligatoires");
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
      "Salle ajoutée (plan de salle généré)",
    );
    if (ok) {
      setHall({ ...hall, name: "" });
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>Nouvelle ville</SectionTitle>
        <div className="mt-3 flex gap-2">
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Annaba"
            className="rounded-xl"
          />
          <Button className="rounded-xl" onClick={() => void addCity()}>
            {t.common.add}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>Nouveau cinéma</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field id="cname" label="Nom">
            <Input
              id="cname"
              value={cinema.name}
              onChange={(e) => setCinema({ ...cinema, name: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field label="Ville">
            <Select
              value={cinema.city_id}
              onValueChange={(v) => setCinema({ ...cinema, city_id: v })}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Choisir" />
              </SelectTrigger>
              <SelectContent>
                {(cities.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="caddr" label="Adresse">
            <Input
              id="caddr"
              value={cinema.address}
              onChange={(e) => setCinema({ ...cinema, address: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field id="cphone" label="Téléphone">
            <Input
              id="cphone"
              value={cinema.phone}
              onChange={(e) => setCinema({ ...cinema, phone: e.target.value })}
              className="rounded-xl"
            />
          </Field>
          <Field id="ccoords" label="Coordonnées GPS (lat, lng)" wide>
            <Input
              id="ccoords"
              value={cinema.coords}
              onChange={(e) => setCinema({ ...cinema, coords: e.target.value })}
              placeholder="36.7538, 3.0588"
              className="rounded-xl"
            />
          </Field>
          <Field id="cdesc" label="Description" wide>
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
        <SectionTitle>Nouvelle salle</SectionTitle>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Cinéma">
            <Select
              value={hall.cinema_id}
              onValueChange={(v) => setHall({ ...hall, cinema_id: v })}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Choisir" />
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
          <Field id="hname" label="Nom de la salle">
            <Input
              id="hname"
              value={hall.name}
              onChange={(e) => setHall({ ...hall, name: e.target.value })}
              placeholder="Salle 1"
              className="rounded-xl"
            />
          </Field>
          <Field id="hcap" label="Places (rangées de 10)">
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
          <Field label="Type">
            <Select
              value={hall.type}
              onValueChange={(v) => setHall({ ...hall, type: v as "standard" | "vip" })}
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
              {c.name} <span className="text-muted-foreground">· {c.city?.name}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {c.halls.length
                ? c.halls.map((h) => `${h.name} (${h.capacity})`).join(" · ")
                : "Aucune salle"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Équipe */

function TeamTab() {
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
      "Rôle attribué",
    );
    if (ok) {
      setEmail("");
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <SectionTitle>Attribuer un rôle</SectionTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          La personne doit d'abord créer son compte et confirmer son e-mail.
        </p>
        <div className="mt-3 space-y-3">
          <Field id="remail" label="E-mail du compte">
            <Input
              id="remail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl"
            />
          </Field>
          <Field label="Rôle">
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
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
            <Field label="Cinéma de rattachement">
              <Select value={cinemaId} onValueChange={setCinemaId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choisir un cinéma" />
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
            Attribuer
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {team.isLoading && <Skeleton className="h-16 rounded-xl" />}
        {(team.data ?? []).map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-medium">{m.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.roles.map((r) => (
                <Badge key={r} variant="secondary" className="gap-1 rounded-full">
                  {t.roles[r]}
                  <button
                    type="button"
                    aria-label={`Retirer le rôle ${t.roles[r]}`}
                    onClick={async () => {
                      if (
                        await run(
                          () => revokeRole({ data: { userId: m.id, role: r } }),
                          "Rôle retiré",
                        )
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
                    aria-label={`Retirer de ${c.name}`}
                    onClick={async () => {
                      if (
                        await run(
                          () => removeStaff({ data: { userId: m.id, cinemaId: c.id } }),
                          "Rattachement retiré",
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
