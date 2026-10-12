import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildTicketBlob, type TicketImageData } from "@/lib/ticket-image";
import { t } from "@/lib/i18n";

export function TicketQr({ data, size = 176 }: { data: TicketImageData; size?: number }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function makeBlob() {
    const canvas = wrapper.current?.querySelector("canvas");
    if (!canvas) throw new Error("QR code indisponible");
    return await buildTicketBlob(canvas as HTMLCanvasElement, data);
  }

  async function download() {
    setBusy(true);
    try {
      const blob = await makeBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `billet-${data.reference}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t.tickets.downloaded);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    try {
      const blob = await makeBlob();
      const file = new File([blob], `billet-${data.reference}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({
          files: [file],
          title: `${t.appName} — ${data.title}`,
          text: `${data.title} · ${data.cinema} · ${data.dateLabel}`,
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `${t.appName} — ${data.title}`,
          text: `${data.title} · ${data.cinema} · ${data.dateLabel} — Réf. ${data.reference}`,
        });
      } else {
        await navigator.clipboard.writeText(
          `${data.title} · ${data.cinema} · ${data.dateLabel} — Réf. ${data.reference}`,
        );
        toast.success(t.tickets.copied);
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        toast.error(e instanceof Error ? e.message : "Erreur");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <div ref={wrapper} className="rounded-xl bg-white p-3">
        <QRCodeCanvas value={data.reference} size={size} />
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
        {t.tickets.ref}
      </p>
      <p className="font-mono text-sm font-bold text-primary">{data.reference}</p>
      <p className="mt-2 text-center text-xs text-muted-foreground">{t.tickets.show}</p>

      <div className="mt-4 grid w-full grid-cols-2 gap-2">
        <Button variant="outline" className="rounded-xl" disabled={busy} onClick={download}>
          <Download className="size-4" />
          {t.tickets.download}
        </Button>
        <Button className="rounded-xl" disabled={busy} onClick={share}>
          <Share2 className="size-4" />
          {t.tickets.share}
        </Button>
      </div>
    </div>
  );
}
