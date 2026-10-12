import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Camera } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { scanTicket, type ScanOutcome } from "@/lib/api";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Contrôle des billets — BookCinéDZ" },
      {
        name: "description",
        content: "Mode agent guichet : scannez les QR codes des billets et refusez les billets déjà utilisés.",
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

type Result = { outcome: ScanOutcome; info?: string } | null;

function ScanPage() {
  const { isAgent, loading } = useAuth();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const busyRef = useRef(false);

  async function check(value: string) {
    if (!value.trim() || busyRef.current) return;
    busyRef.current = true;
    try {
      setResult(await scanTicket(value));
    } catch {
      setResult({ outcome: "invalid" });
    } finally {
      setTimeout(() => (busyRef.current = false), 1200);
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
            className={`mt-5 flex items-center gap-3 rounded-2xl border p-4 ${
              result.outcome === "ok"
                ? "border-primary bg-primary/15"
                : result.outcome === "used"
                  ? "border-primary bg-primary/15"
                  : "border-destructive bg-destructive/15"
            }`}
            role="status"
          >
            {result.outcome === "ok" ? (
              <CheckCircle2 className="size-6 text-primary" />
            ) : result.outcome === "used" ? (
              <AlertTriangle className="size-6 text-primary" />
            ) : (
              <XCircle className="size-6 text-destructive" />
            )}
            <div>
              <p className="font-semibold">
                {result.outcome === "ok"
                  ? t.scan.ok
                  : result.outcome === "used"
                    ? t.scan.used
                    : t.scan.invalid}
              </p>
              {result.info && <p className="text-xs text-muted-foreground">{result.info}</p>}
            </div>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
