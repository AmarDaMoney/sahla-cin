import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { TicketQr } from "@/components/TicketQr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { fetchMyTickets } from "@/lib/api";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/tickets")({
  validateSearch: (search: Record<string, unknown>): { qr?: string } => {
    const qr = search["qr"];
    return typeof qr === "string" ? { qr } : {};
  },
  head: () => ({
    meta: [
      { title: "Mes réservations et billets QR — BookCinéDZ" },
      {
        name: "description",
        content:
          "Historique de vos réservations de cinéma, billets électroniques avec QR code à télécharger ou partager.",
      },
      { property: "og:title", content: "Mes réservations — BookCinéDZ" },
      {
        property: "og:description",
        content: "Vos billets de cinéma avec QR code, téléchargeables et partageables.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketsPage,
});

const fmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

type TicketRow = {
  id: string;
  qr_code: string;
  scanned: boolean;
  created_at: string;
  booking: {
    total_amount: number;
    status: string;
    booking_seats: { seat: { row_label: string; seat_number: number } | null }[];
    screening: {
      starts_at: string;
      audio_language: string;
      movie: { title: string };
      hall: { name: string; cinema: { name: string } };
    } | null;
  } | null;
};

function seatLabels(tk: TicketRow) {
  return (tk.booking?.booking_seats ?? [])
    .map((bs) => (bs.seat ? `${bs.seat.row_label}${bs.seat.seat_number}` : ""))
    .filter(Boolean)
    .join(", ");
}

function TicketsPage() {
  const { qr } = Route.useSearch();
  const { user, loading } = useAuth();
  const [openQr, setOpenQr] = useState<string | null>(null);

  const tickets = useQuery({
    queryKey: ["my-tickets", user?.id],
    queryFn: fetchMyTickets,
    enabled: !!user,
  });

  const rows = (tickets.data ?? []) as unknown as TicketRow[];

  const { upcoming, history } = useMemo(() => {
    const now = Date.now();
    const up: TicketRow[] = [];
    const past: TicketRow[] = [];
    rows.forEach((tk) => {
      const start = tk.booking?.screening?.starts_at;
      const isPast = !start || new Date(start).getTime() < now;
      (isPast ? past : up).push(tk);
    });
    up.sort(
      (a, b) =>
        new Date(a.booking?.screening?.starts_at ?? 0).getTime() -
        new Date(b.booking?.screening?.starts_at ?? 0).getTime(),
    );
    return { upcoming: up, history: past };
  }, [rows]);

  // Accès direct au billet juste après la confirmation de réservation.
  useEffect(() => {
    if (qr && rows.some((r) => r.qr_code === qr)) setOpenQr(qr);
  }, [qr, rows]);

  const active = rows.find((r) => r.qr_code === openQr) ?? null;

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.tickets.title}</h1>

        {!user && !loading && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">{t.booking.needAuth}</p>
            <Button asChild className="mt-4 rounded-xl">
              <Link to="/auth" search={{ redirect: "/tickets" }}>
                {t.common.signIn}
              </Link>
            </Button>
          </div>
        )}

        {tickets.isLoading && user && <Skeleton className="mt-6 h-60 rounded-2xl" />}

        {user && !tickets.isLoading && (
          <Tabs defaultValue="upcoming" className="mt-5">
            <TabsList className="grid w-full grid-cols-2 rounded-xl">
              <TabsTrigger value="upcoming" className="rounded-lg">
                {t.tickets.upcoming} ({upcoming.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="rounded-lg">
                {t.tickets.history} ({history.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-4 space-y-3">
              {upcoming.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t.tickets.emptyUpcoming}
                </p>
              )}
              {upcoming.map((tk) => (
                <TicketItem key={tk.id} tk={tk} onOpen={() => setOpenQr(tk.qr_code)} />
              ))}
            </TabsContent>

            <TabsContent value="history" className="mt-4 space-y-3">
              {history.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t.tickets.emptyHistory}
                </p>
              )}
              {history.map((tk) => (
                <TicketItem key={tk.id} tk={tk} past onOpen={() => setOpenQr(tk.qr_code)} />
              ))}
            </TabsContent>
          </Tabs>
        )}
      </main>

      <Dialog open={!!active} onOpenChange={(o) => !o && setOpenQr(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{active?.booking?.screening?.movie.title ?? "Billet"}</DialogTitle>
            <DialogDescription>
              {active?.booking?.screening
                ? `${active.booking.screening.hall.cinema.name} · ${fmt.format(new Date(active.booking.screening.starts_at))}`
                : t.tickets.title}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <TicketQr
              data={{
                title: active.booking?.screening?.movie.title ?? "Séance",
                cinema: active.booking?.screening
                  ? `${active.booking.screening.hall.cinema.name} · ${active.booking.screening.hall.name}`
                  : "",
                dateLabel: active.booking?.screening
                  ? fmt.format(new Date(active.booking.screening.starts_at))
                  : "",
                seats: seatLabels(active),
                total: `${active.booking?.total_amount ?? 0} ${t.common.da}`,
                reference: active.qr_code,
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}

function TicketItem({
  tk,
  past,
  onOpen,
}: {
  tk: TicketRow;
  past?: boolean;
  onOpen: () => void;
}) {
  const s = tk.booking?.screening;
  const seats = seatLabels(tk);
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{s?.movie.title ?? "Séance"}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {s?.hall.cinema.name} · {s?.hall.name}
          </p>
          {s && <p className="text-xs text-muted-foreground">{fmt.format(new Date(s.starts_at))}</p>}
        </div>
        <Badge variant={tk.scanned ? "secondary" : past ? "outline" : "default"}>
          {tk.scanned ? t.tickets.scanned : past ? t.tickets.past : t.tickets.valid}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="truncate text-muted-foreground">
          {seats || "—"} ·{" "}
          <span className="font-semibold text-primary">
            {tk.booking?.total_amount} {t.common.da}
          </span>
        </span>
        <Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={onOpen}>
          <QrCode className="size-4 text-primary" />
          {t.tickets.view}
        </Button>
      </div>
    </article>
  );
}
