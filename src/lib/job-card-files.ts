import "server-only";

import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { HttpError } from "@/lib/http";
import { jobCardPhotoRoot } from "@/lib/job-card-entry";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Checks and stores an uploaded photo / PDF of a job card under uploads/jobcards/YYYY-MM/<uuid>.<ext>.
 * Used for reading a new card (Add Job Card) and for the document of a typed card (created in Oracle).
 */
export async function storeJobCardFile(form: FormData | null, field = "image") {
  const file = form?.get(field);
  if (!file || typeof file === "string") throw new HttpError(400, "Take a photo or choose a PDF of the job card.");
  // Some browsers send a PDF without a type (or a generic one); go by the file name then.
  const generic = !file.type || file.type === "application/octet-stream";
  const mimeType = generic ? (/\.pdf$/i.test(file.name) ? "application/pdf" : "") : file.type;
  const ext = TYPES[mimeType];
  if (!ext) throw new HttpError(400, "Only JPG, PNG, WEBP photos or a PDF are supported.");
  if (file.size > MAX_BYTES) throw new HttpError(400, "The file is larger than 15 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (ext === "pdf" && buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, "This file is not a valid PDF.");
  const month = new Date().toISOString().slice(0, 7);
  await mkdir(path.join(jobCardPhotoRoot(), month), { recursive: true });
  const photoPath = `${month}/${randomUUID()}.${ext}`;
  await writeFile(path.join(jobCardPhotoRoot(), photoPath), buffer);
  return { photoPath, mimeType, buffer, fileName: file.name };
}

export async function removeJobCardFile(photoPath: string) {
  if (!photoPath) return;
  await unlink(path.join(jobCardPhotoRoot(), photoPath)).catch(() => undefined);
}

/** A card still waits for its document while it was added without one (typed, Excel, API) and none was uploaded. */
export const NEEDS_DOCUMENT_WHERE = { documentRequired: true, photoPath: "", active: true } as const;
