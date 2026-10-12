import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
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
  fetchCinemas,
  fetchMovies,
  fetchScreeningsByStatus,
  setScreeningStatus,
  upsertMovie,
  type AppRole,
} from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Espace administrateur — BookCinéDZ" },
      {
        name: "description",
        content: "Validez les programmes soumis, gérez le catalogue de films et les rôles des utilisateurs.",
      },
      { property: "og:title", content: "Administration — BookCinéDZ" },
      { property: "og:description", content: "Validation des programmes et gestion du catalogue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

const fmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const roles: AppRole[] = ["client", "contributeur", "admin", "agent_guichet"];

function Admin() {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();

  const queue = useQuery({
    queryKey: ["screenings", "en_revue"],
    queryFn: () => fetchScreeningsByStatus("en_revue"),
    enabled: isAdmin,
  });
  const movies = useQuery({ queryKey: ["movies"], queryFn: fetchMovies, enabled: isAdmin });
  const cinemas = useQuery({ queryKey: ["cinemas"], queryFn: fetchCinemas, enabled: isAdmin });

  const [form, setForm] = useState({
    title: "",
    duration_minutes: "120",
    genre: "",
    synopsis: "",
    poster_url: "",
    age_rating: "",
  });
  const [roleUser, setRoleUser] = useState("");
  const [role, setRole] = useState<AppRole>("contributeur");
  const [staffCinema, setStaffCinema] = useState("");

  if (!loading && !isAdmin) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">Cet espace est réservé aux administrateurs.</p>
          <Button asChild className="mt-4 rounded-xl">
            <Link to="/compte">{t.nav.account}</Link>
          </Button>
        </main>
        <BottomNav />
      </div>
    );
  }

  async function publishAll() {
    const ids = (queue.data ?? []).map((s) => s.id);
    if (!ids.length) return;
    await setScreeningStatus(ids, "publie");
    toast.success(t.admin.published);
    await queryClient.invalidateQueries({ queryKey: ["screenings"] });
  }

  async function addMovie() {
    if (!form.title.trim()) return;
    try {
      await upsertMovie({
        title: form.title.trim(),
        duration_minutes: Number(form.duration_minutes),
        genre: form.genre || null,
        synopsis: form.synopsis || null,
        poster_url: form.poster_url || null,
        age_rating: form.age_rating || null,
      });
      toast.success("Film ajouté");
      setForm({ title: "", duration_minutes: "120", genre: "", synopsis: "", poster_url: "", age_rating: "" });
      await queryClient.invalidateQueries({ queryKey: ["movies"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  async function grantRole() {
    if (!roleUser.trim()) return;
    try {
      await assignRole(roleUser.trim(), role);
      if (role === "contributeur" && staffCinema) {
        const res = await supabase
          .from("cinema_staff")
          .insert({ user_id: roleUser.trim(), cinema_id: staffCinema });
        if (res.error) throw new Error(res.error.message);
      }
      toast.success("Rôle attribué");
      setRoleUser("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.admin.title}</h1>

        <Tabs defaultValue="queue" className="mt-5">
          <TabsList className="w-full">
            <TabsTrigger value="queue" className="flex-1">
              Validation
            </TabsTrigger>
            <TabsTrigger value="movies" className="flex-1">
              {t.admin.movies}
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex-1">
              {t.admin.roles}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">{t.admin.queue}</h2>
              <Button size="sm" className="rounded-xl" onClick={publishAll}>
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
                      {s.hall.cinema.name} · {s.hall.name} · {fmt.format(new Date(s.starts_at))}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={async () => {
                      await setScreeningStatus([s.id], "publie");
                      await queryClient.invalidateQueries({ queryKey: ["screenings"] });
                    }}
                  >
                    {t.admin.publish}
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="movies" className="mt-4 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">Nouveau film</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="title">Titre</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dur">Durée (min)</Label>
                  <Input
                    id="dur"
                    type="number"
                    value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="genre">Genres</Label>
                  <Input
                    id="genre"
                    value={form.genre}
                    onChange={(e) => setForm({ ...form, genre: e.target.value })}
                    placeholder="Drame, Comédie"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="age">Classification</Label>
                  <Input
                    id="age"
                    value={form.age_rating}
                    onChange={(e) => setForm({ ...form, age_rating: e.target.value })}
                    placeholder="Tous publics"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="poster">Affiche (URL)</Label>
                  <Input
                    id="poster"
                    value={form.poster_url}
                    onChange={(e) => setForm({ ...form, poster_url: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="syn">Synopsis</Label>
                  <Textarea
                    id="syn"
                    value={form.synopsis}
                    onChange={(e) => setForm({ ...form, synopsis: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              </div>
              <Button className="mt-4 w-full rounded-xl" onClick={addMovie}>
                <Plus className="size-4" />
                {t.common.add}
              </Button>
            </div>

            <div className="space-y-2">
              {(movies.data ?? []).map((m) => (
                <div key={m.id} className="rounded-xl border border-border bg-card p-3">
                  <p className="text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.duration_minutes} {t.common.minutes} · {m.genre ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="roles" className="mt-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                Attribuer un rôle
              </h2>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="uid">Identifiant utilisateur</Label>
                  <Input
                    id="uid"
                    value={roleUser}
                    onChange={(e) => setRoleUser(e.target.value)}
                    placeholder="UUID de l'utilisateur"
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Rôle</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t.roles[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {role === "contributeur" && (
                  <div className="space-y-1.5">
                    <Label>Cinéma assigné</Label>
                    <Select value={staffCinema} onValueChange={setStaffCinema}>
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
                  </div>
                )}
                <Button className="w-full rounded-xl" onClick={grantRole}>
                  {t.common.save}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
      <BottomNav />
    </div>
  );
}
