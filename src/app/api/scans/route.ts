import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canEnterRecords } from "@/lib/auth/access";
import { HttpError, withUser, assertMethod } from "@/lib/http";
import { emptySheet, extractSheet } from "@/lib/ocr";
import { scanRoot } from "@/lib/scans";
import { audit } from "@/lib/audit";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 15 * 1024 * 1024;

/** Upload a photo of a filled sheet; stores it and reads it with the AI providers from Settings (in priority order), else Tesseract. */
export const POST = withUser(async (request, user) => {
  await assertMethod(user, "photo");
  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || typeof file === "string") throw new HttpError(400, "Take or choose a photo of the sheet.");
  const ext = TYPES[file.type];
  if (!ext) throw new HttpError(400, "Only JPG, PNG or WEBP photos are supported.");
  if (file.size > MAX_BYTES) throw new HttpError(400, "The photo is larger than 15 MB.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const month = new Date().toISOString().slice(0, 7);
  const dir = path.join(scanRoot(), month);
  await mkdir(dir, { recursive: true });
  const fileName = `${randomUUID()}.${ext}`;
  await writeFile(path.join(dir, fileName), buffer);

  let engine = "";
  let warning = "";
  let ocrError = "";
  let rawText = "";
  let sheet = emptySheet();
  try {
    const result = await extractSheet(buffer, file.type);
    engine = result.engine;
    warning = result.warning;
    rawText = result.rawText;
    sheet = result.sheet;
  } catch (error) {
    ocrError = error instanceof Error ? error.message : "Could not read the photo.";
  }

  const scan = await prisma.scanSheet.create({
    data: {
      filePath: path.posix.join(month, fileName),
      mimeType: file.type,
      ocrEngine: engine,
      ocrError: ocrError || warning,
      rawText,
      extracted: sheet as unknown as Prisma.InputJsonValue,
      uploadedById: user.id,
    },
  });
  await audit(user.id, "SCAN_UPLOADED", "ScanSheet", scan.id, { engine, rows: sheet.rows.length });
  return NextResponse.json({ id: scan.id });
}, canEnterRecords);
