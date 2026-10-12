import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Camera, Banknote } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { scanTicket, type ScanResult } from "@/lib/api";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Contrôle des billets — BookCinéDZ" },
      {
        name: "description",
        content:
          "Mode agent guichet : scannez les QR codes des billets et refusez les billets déjà utilisés.",
      },
      { property: "og:title", content: "Contrôle des billets — BookCinéDZ" },
      { property: "og:description", content: "Scanner de billets pour les agents de guichet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ScanPage,
});

function ScanPage() {
  const { isAgent, loading } = useAuth();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lastCode, setLastCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const busyRef = useRef(false);

  async function check(value: string) {
    if (!value.trim() || busyRef.current) return;
    busyRef.current = true;
    try {
      setLastCode(value);
      setResult(await scanTicket({ data: { code: value, collectCash: false } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de contrôle");
      setResult(null);
    } finally {
      setTimeout(() => (busyRef.current = false), 1200);
    }
  }

  async function collectCash() {
    try {
      setResult(await scanTicket({ data: { code: lastCode, collectCash: true } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur d'encaissement");
    }
  }

  async function startCamera() {
    const { Html5Qrcode } = await import("html5-qrcode");
    const instance = new Html5Qrcode("qr-reader");
    scannerRef.current = instance as unknown as { stop: () => Promise<void>; clear: () => void };
    setScanning(true);
    await instance.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decoded) => void check(decoded),
      () => {},
    );
  }

  async function stopCamera() {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      /* déjà arrêté */
    }
    scannerRef.current = null;
    setScanning(false);
  }

  useEffect(() => {
    return () => {
      void scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  if (!loading && !isAgent) {
    return (
      <div className="min-h-screen pb-24">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Cet espace est réservé aux agents de guichet.
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
      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.scan.title}</h1>

        <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card p-4">
          <div id="qr-reader" className="overflow-hidden rounded-xl" />
          <Button
            className="mt-3 w-full rounded-xl"
            variant={scanning ? "outline" : "default"}
            onClick={() => (scanning ? void stopCamera() : void startCamera())}
          >
            <Camera className="size-4" />
            {scanning ? t.scan.stop : t.scan.start}
          </Button>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <label htmlFor="code" className="text-sm font-medium">
            {t.scan.manual}
          </label>
          <div className="mt-2 flex gap-2">
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="BCDZ-…"
              className="rounded-xl"
            />
            <Button className="rounded-xl" onClick={() => void check(code)}>
              {t.scan.validate}
            </Button>
          </div>
        </div>

        {result && (
          <div
            className={`mt-5 rounded-2xl border p-4 ${
              result.outcome === "ok"
                ? "border-emerald-500 bg-emerald-500/15"
                : result.outcome === "unpaid" || result.outcome === "used"
                  ? "border-amber-500 bg-amber-500/15"
                  : "border-destructive bg-destructive/15"
            }`}
            role="status"
          >
            <div className="flex items-center gap-3">
              {result.outcome === "ok" ? (
                <CheckCircle2 className="size-6 text-emerald-500" />
              ) : result.outcome === "unpaid" || result.outcome === "used" ? (
                <AlertTriangle className="size-6 text-amber-500" />
              ) : (
                <XCircle className="size-6 text-destructive" />
              )}
              <div>
                <p className="font-semibold">{t.scan[result.outcome]}</p>
                {result.info && <p className="text-xs text-muted-foreground">{result.info}</p>}
              </div>
            </div>
            {result.outcome === "unpaid" && (
              <Button className="mt-3 w-full rounded-xl" onClick={() => void collectCash()}>
                <Banknote className="size-4" />
                {t.scan.collect} — {result.amount} {t.common.da}
              </Button>
            )}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
