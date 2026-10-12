import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Ticket } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { createBooking, fetchScreening, fetchSeats, fetchTakenSeatIds } from "@/lib/api";
import { paymentMethods, processPayment, type PaymentMethod } from "@/lib/payments";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/reserver/$screeningId")({
  head: () => ({
    meta: [
      { title: "Réserver une séance — BookCinéDZ" },
      {
        name: "description",
        content:
          "Choisissez vos sièges sur le plan de salle, payez par CIB, BaridiMob ou Edahabia et recevez votre billet QR.",
      },
      { property: "og:title", content: "Réservation — BookCinéDZ" },
      { property: "og:description", content: "Plan de salle, paiement et billet électronique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingPage,
});

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

function BookingPage() {
  const { screeningId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();

  const [selected, setSelected] = useState<string[]>([]);
  const [method, setMethod] = useState<PaymentMethod["id"]>("cib");
  const [submitting, setSubmitting] = useState(false);

  const screening = useQuery({
    queryKey: ["screening", screeningId],
    queryFn: () => fetchScreening(screeningId),
  });
  const hallId = screening.data?.hall_id;
  const seats = useQuery({
    queryKey: ["seats", hallId],
    queryFn: () => fetchSeats(hallId!),
    enabled: !!hallId,
  });
  const taken = useQuery({
    queryKey: ["taken", screeningId],
    queryFn: () => fetchTakenSeatIds(screeningId),
  });

  const takenSet = useMemo(() => new Set(taken.data ?? []), [taken.data]);

  const rows = useMemo(() => {
    const map = new Map<string, NonNullable<typeof seats.data>>();
    (seats.data ?? []).forEach((s) => {
      const arr = map.get(s.row_label) ?? [];
      arr.push(s);
      map.set(s.row_label, arr);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [seats.data]);

  const price = screening.data?.price ?? 0;
  const total = selected.length * price;

  function toggleSeat(id: string) {
    if (takenSet.has(id)) return;
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length >= 6 ? prev : [...prev, id],
    );
  }

  async function confirm() {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/reserver/${screeningId}` } });
      return;
    }
    if (selected.length === 0) {
      toast.error(t.booking.noSeat);
      return;
    }
    setSubmitting(true);
    try {
      const payment = await processPayment({ method, amount: total });
      if (!payment.ok) throw new Error(payment.error);
      const booking = await createBooking({
        screeningId,
        seatIds: selected,
        totalAmount: total,
        paid: method !== "espece",
      });
      await queryClient.invalidateQueries({ queryKey: ["taken", screeningId] });
      toast.success(t.booking.success);
      navigate({ to: "/tickets", search: { qr: booking.qrCode } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la réservation");
      void taken.refetch();
      setSelected([]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <AppHeader
        right={
          <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            {t.common.back}
          </Link>
        }
      />
      <main className="mx-auto max-w-3xl px-4 py-6">
        {screening.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : (
          screening.data && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h1 className="text-lg font-bold">{screening.data.movie.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {screening.data.hall.cinema.name} · {screening.data.hall.name} ·{" "}
                {t.languages[screening.data.audio_language]}
              </p>
              <p className="text-sm text-muted-foreground">
                {dateFmt.format(new Date(screening.data.starts_at))}
              </p>
            </div>
          )
        )}

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
            {t.booking.chooseSeats}
          </h2>

          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <div className="mx-auto mb-5 w-3/4 rounded-b-2xl border-b-2 border-primary/70 pb-1 text-center text-[10px] tracking-[0.3em] text-primary">
              {t.booking.screen}
            </div>

            {seats.isLoading && <Skeleton className="h-40 w-full" />}

            <div className="space-y-1.5 overflow-x-auto">
              {rows.map(([label, rowSeats]) => (
                <div key={label} className="flex items-center justify-center gap-1.5">
                  <span className="w-4 shrink-0 text-[10px] text-muted-foreground">{label}</span>
                  {rowSeats.map((s) => {
                    const isTaken = takenSet.has(s.id);
                    const isSel = selected.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleSeat(s.id)}
                        disabled={isTaken}
                        aria-label={`Siège ${s.row_label}${s.seat_number}${isTaken ? ` — ${t.booking.taken}` : ""}`}
                        aria-pressed={isSel}
                        className={`size-6 shrink-0 rounded-md text-[9px] font-medium transition-colors ${
                          isTaken
                            ? "cursor-not-allowed bg-muted/40 text-muted-foreground/40"
                            : isSel
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                        }`}
                      >
                        {s.seat_number}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-secondary" /> Libre
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-primary" /> Sélectionné
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded bg-muted/40" /> {t.booking.taken}
              </span>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">Paiement</h2>
          <div className="mt-3 space-y-2">
            {paymentMethods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setMethod(p.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                  method === p.id ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-xs text-muted-foreground">{p.hint}</span>
                </span>
                {method === p.id && <CheckCircle2 className="size-5 text-primary" />}
              </button>
            ))}
          </div>
        </section>

        <Separator className="my-6" />

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {t.booking.selected}: {selected.length} × {price} {t.common.da}
          </span>
          <span className="text-xl font-bold text-primary">
            {total} {t.common.da}
          </span>
        </div>

        {!user && !authLoading && (
          <p className="mt-3 text-sm text-muted-foreground">{t.booking.needAuth}</p>
        )}

        <Button
          className="mt-4 w-full rounded-xl py-6 text-base"
          disabled={submitting || selected.length === 0}
          onClick={confirm}
        >
          <Ticket className="size-5" />
          {submitting ? t.common.loading : t.booking.pay}
        </Button>
      </main>
      <BottomNav />
    </div>
  );
}
