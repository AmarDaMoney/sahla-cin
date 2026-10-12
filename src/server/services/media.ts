// Images (affiches) stockées dans la base. Le type est déterminé par le
// contenu réel du fichier (signature binaire), jamais par son nom : seuls
// JPEG, PNG et WebP sont acceptés (pas de SVG, qui peut contenir du script).
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { media } from "../db/schema";
import { AppError } from "@/lib/errors";

export const MAX_IMAGE_BYTES = 3_000_000;

export function detectImageType(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i];
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)) {
    return "image/png";
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

export const mediaUrl = (id: string) => `/api/media/${id}`;

export async function saveImage(db: Db, userId: string, base64: string) {
  const data = Buffer.from(base64, "base64");
  if (!data.length) throw new AppError("IMAGE_EMPTY", "Image vide");
  if (data.length > MAX_IMAGE_BYTES) {
    throw new AppError("IMAGE_TOO_LARGE", "Image trop lourde (3 Mo maximum)");
  }
  const contentType = detectImageType(data);
  if (!contentType) {
    throw new AppError("IMAGE_FORMAT", "Format non pris en charge (JPEG, PNG ou WebP)");
  }
  const sha256 = createHash("sha256").update(data).digest("hex");

  // Même fichier déjà envoyé : on le réutilise.
  const [existing] = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.sha256, sha256))
    .limit(1);
  if (existing) return { id: existing.id, url: mediaUrl(existing.id) };

  const [row] = await db
    .insert(media)
    .values({ content_type: contentType, data, size: data.length, sha256, uploaded_by: userId })
    .returning({ id: media.id });
  return { id: row!.id, url: mediaUrl(row!.id) };
}

export async function getImage(db: Db, id: string) {
  const [row] = await db
    .select({ content_type: media.content_type, data: media.data, sha256: media.sha256 })
    .from(media)
    .where(eq(media.id, id));
  if (!row) return null;
  return { ...row, data: Buffer.from(row.data) };
}
