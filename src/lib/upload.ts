import "server-only";

import { HttpError } from "@/lib/http";

const MAX_EXCEL_BYTES = 20 * 1024 * 1024;

/** Reads an uploaded .xlsx file from multipart form field "file". */
export async function readExcelUpload(request: Request): Promise<{ data: ArrayBuffer; fileName: string }> {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "Choose an Excel file to upload.");
  if (!/\.xlsx$/i.test(file.name)) throw new HttpError(400, "Only .xlsx files are supported. Use the provided template.");
  if (file.size > MAX_EXCEL_BYTES) throw new HttpError(400, "The file is larger than 20 MB.");
  return { data: await file.arrayBuffer(), fileName: file.name };
}
