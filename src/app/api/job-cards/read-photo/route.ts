import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { canAddJobCards } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { jobCardPhotoRoot } from "@/lib/job-card-entry";
import { readJobCardPhoto } from "@/lib/job-card-photo";
import { audit } from "@/lib/audit";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Upload a photo (or PDF) of the printed job card. It is stored and read by the AI providers; the extracted
 * details come back for the review screen. Nothing is created until the user saves.
 */
export const POST = withUser(async (request, user) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || typeof file === "string") throw new HttpError(400, "Take or choose a photo of the job card.");
  const ext = TYPES[file.type];
  if (!ext) throw new HttpError(400, "Only JPG, PNG, WEBP photos or a PDF are supported.");
  if (file.size > MAX_BYTES) throw new HttpError(400, "The file is larger than 15 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const month = new Date().toISOString().slice(0, 7);
  await mkdir(path.join(jobCardPhotoRoot(), month), { recursive: true });
  const photoPath = `${month}/${randomUUID()}.${ext}`;
  await writeFile(path.join(jobCardPhotoRoot(), photoPath), buffer);

  const result = await readJobCardPhoto(buffer, file.type);
  await audit(user.id, "JOB_CARD_PHOTO_READ", "JobCard", "", { photoPath, engine: result.engine, number: result.draft.code, error: result.error || undefined });
  return NextResponse.json({ photoPath, mimeType: file.type, ...result });
}, canAddJobCards);
