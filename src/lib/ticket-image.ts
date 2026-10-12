// Génère une image PNG du billet (fond bleu nuit + accents rouges) à partir
// du canvas du QR code, pour le téléchargement et le partage natif.

export type TicketImageData = {
  title: string;
  cinema: string;
  dateLabel: string;
  seats: string;
  total: string;
  reference: string;
};

const W = 720;
const H = 1080;

export type TicketImageLabels = {
  appName: string;
  heading: string;
  reference: string;
  seats: string;
  total: string;
  footer: string;
  rtl: boolean;
};

export async function buildTicketBlob(
  qrCanvas: HTMLCanvasElement,
  data: TicketImageData,
  labels: TicketImageLabels,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas");
  // Arabe : texte de droite à gauche, aligné sur le bord droit.
  ctx.direction = labels.rtl ? "rtl" : "ltr";
  const startX = labels.rtl ? W - 48 : 48;
  const endX = labels.rtl ? 48 : W - 48;
  const start = () => (ctx.textAlign = labels.rtl ? "right" : "left");
  const end = () => (ctx.textAlign = labels.rtl ? "left" : "right");
  start();

  // Fond bleu nuit
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  // Bandeau supérieur rouge
  ctx.fillStyle = "#dc2626";
  ctx.fillRect(0, 0, W, 12);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px system-ui, sans-serif";
  ctx.fillText(labels.appName, startX, 96);
  ctx.fillStyle = "#dc2626";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText(labels.heading, startX, 130);

  // Titre du film
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px system-ui, sans-serif";
  wrap(ctx, data.title, startX, 200, W - 96, 46);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "22px system-ui, sans-serif";
  ctx.fillText(truncate(ctx, data.cinema, W - 96), startX, 290);
  ctx.fillText(truncate(ctx, data.dateLabel, W - 96), startX, 324);

  // Carte QR blanche
  const qrSize = 340;
  const qrX = (W - qrSize) / 2;
  const qrY = 380;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, qrX - 24, qrY - 24, qrSize + 48, qrSize + 48, 24);
  ctx.fill();
  ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  ctx.textAlign = "center";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(labels.reference.toUpperCase(), W / 2, qrY + qrSize + 76);
  ctx.fillStyle = "#dc2626";
  ctx.font = "bold 26px ui-monospace, monospace";
  ctx.fillText(data.reference, W / 2, qrY + qrSize + 110);
  start();

  // Détails
  let y = qrY + qrSize + 180;
  const line = (label: string, value: string) => {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "20px system-ui, sans-serif";
    start();
    ctx.fillText(label, startX, y);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px system-ui, sans-serif";
    end();
    ctx.fillText(value, endX, y);
    start();
    y += 44;
  };
  line(labels.seats, data.seats || "—");
  line(labels.total, data.total);

  ctx.fillStyle = "#64748b";
  ctx.font = "18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(labels.footer, W / 2, H - 48);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export"))), "image/png"),
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 3 && ctx.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      line = word;
      if (lines === 2) break;
    } else {
      line = test;
    }
  }
  ctx.fillText(truncate(ctx, line, maxWidth), x, y + lines * lineHeight);
}
