import "server-only";

import { appConfig } from "@/lib/env";
import { getSettings } from "@/lib/settings";

export type ExtractedRow = {
  jobCardNo: string;
  startDate: string;
  endDate: string;
  hours: string;
  remarks: string;
};

export type ExtractedSheet = {
  employeeFileNo: string;
  employeeName: string;
  preparedByName: string;
  preparedByDate: string;
  approvedByName: string;
  approvedByDate: string;
  rows: ExtractedRow[];
};

export type OcrResult = {
  engine: "claude" | "tesseract";
  sheet: ExtractedSheet;
  rawText: string;
  /** Problem with the preferred engine (e.g. Claude failed and Tesseract was used instead) */
  warning: string;
};

export const emptySheet = (): ExtractedSheet => ({
  employeeFileNo: "",
  employeeName: "",
  preparedByName: "",
  preparedByDate: "",
  approvedByName: "",
  approvedByDate: "",
  rows: [],
});

const PROMPT = `This is a photo of a handwritten "Man Hour Sheet" from Ahmadiah Contracting & Trading Co.
Header fields: Employee File No., Employee Name, Job Title, Supervisor Name.
Table columns: No. | Job Card No. | Start Date | End Date | Hours Worked | Remarks (up to 15 rows).
Footer: "Prepared By" and "Approved By", each with Name, Signature and Date.

Read the handwriting carefully and return ONLY a JSON object, no other text, in exactly this shape:
{"employeeFileNo":"","employeeName":"","preparedByName":"","preparedByDate":"","approvedByName":"","approvedByDate":"",
 "rows":[{"jobCardNo":"","startDate":"","endDate":"","hours":"","remarks":""}]}

Rules:
- Include only table rows that have something written in them, in order.
- Dates are day-first (DD/MM/YYYY). Return dates as DD/MM/YYYY. If only one date is written for a row, use it for both start and end.
- hours: just the number (e.g. "7.5"). Do not include the TOTAL HOURS line as a row.
- Copy job card numbers exactly as written (letters, digits, dashes). Use "" for anything you cannot read; never guess.
- Ignore signatures.`;

function coerceSheet(input: unknown): ExtractedSheet {
  const sheet = emptySheet();
  if (!input || typeof input !== "object") return sheet;
  const source = input as Record<string, unknown>;
  const text = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());
  sheet.employeeFileNo = text(source.employeeFileNo);
  sheet.employeeName = text(source.employeeName);
  sheet.preparedByName = text(source.preparedByName);
  sheet.preparedByDate = text(source.preparedByDate);
  sheet.approvedByName = text(source.approvedByName);
  sheet.approvedByDate = text(source.approvedByDate);
  if (Array.isArray(source.rows)) {
    sheet.rows = source.rows
      .map((row) => {
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          jobCardNo: text(r.jobCardNo),
          startDate: text(r.startDate),
          endDate: text(r.endDate) || text(r.startDate),
          hours: text(r.hours),
          remarks: text(r.remarks),
        };
      })
      .filter((row) => row.jobCardNo || row.hours || row.startDate);
  }
  return sheet;
}

async function runClaude(image: Buffer, mimeType: string, apiKey: string, model: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: image.toString("base64") } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });

  const payload = (await response.json().catch(() => null)) as {
    content?: { type: string; text?: string }[];
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Claude API returned HTTP ${response.status}`);
  }
  const text = (payload?.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Claude did not return readable data for this photo.");
  return { sheet: coerceSheet(JSON.parse(text.slice(start, end + 1))), rawText: text };
}

const DATE_RE = /(\d{1,2}\s*[/.\-]\s*\d{1,2}\s*[/.\-]\s*\d{2,4})/g;

/** Best-effort parse of OCR text into sheet rows: lines that contain a date and a number. */
export function parseOcrText(text: string): ExtractedSheet {
  const sheet = emptySheet();
  const fileNo = text.match(/file\s*no\.?\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9\-/]*)/i);
  if (fileNo) sheet.employeeFileNo = fileNo[1];
  const name = text.match(/employee\s*name\s*[:\-]?\s*([^\n|]+)/i);
  if (name) sheet.employeeName = name[1].trim();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[|[\]{}]/g, " ").replace(/\s+/g, " ").trim();
    if (!line || /total\s*hours/i.test(line)) continue;
    const dates = Array.from(line.matchAll(DATE_RE)).map((match) => match[1].replace(/\s+/g, ""));
    if (dates.length === 0) continue;
    const firstDateAt = line.search(DATE_RE);
    const before = line.slice(0, firstDateAt).trim().split(" ");
    // Drop a leading row number (1–15)
    if (before.length > 1 && /^\d{1,2}$/.test(before[0])) before.shift();
    const jobCardNo = before.join(" ").trim();
    const lastDate = Array.from(line.matchAll(DATE_RE)).pop();
    const after = lastDate ? line.slice((lastDate.index ?? 0) + lastDate[0].length).trim() : "";
    const hoursMatch = after.match(/^(\d+(?:[.,]\d+)?)/);
    if (!jobCardNo && !hoursMatch) continue;
    sheet.rows.push({
      jobCardNo,
      startDate: dates[0],
      endDate: dates[1] ?? dates[0],
      hours: hoursMatch ? hoursMatch[1].replace(",", ".") : "",
      remarks: hoursMatch ? after.slice(hoursMatch[0].length).trim() : after,
    });
  }
  return sheet;
}

async function runTesseract(image: Buffer, language: string) {
  const { createWorker } = await import("tesseract.js");
  const tessdata = appConfig.tessdataDir();
  const worker = await createWorker(language || "eng", 1, {
    ...(tessdata ? { langPath: tessdata, gzip: false } : {}),
    cachePath: tessdata || undefined,
  });
  try {
    const result = await worker.recognize(image);
    const rawText = result.data.text ?? "";
    return { sheet: parseOcrText(rawText), rawText };
  } finally {
    await worker.terminate();
  }
}

/** Uses Claude when an API key is configured in Settings, otherwise (or if Claude fails) Tesseract. */
export async function extractSheet(image: Buffer, mimeType: string): Promise<OcrResult> {
  const settings = await getSettings();
  let warning = "";
  if (settings.claudeApiKey) {
    try {
      const result = await runClaude(image, mimeType, settings.claudeApiKey, settings.claudeModel);
      return { engine: "claude", warning, ...result };
    } catch (error) {
      warning = `Claude API could not read the photo (${error instanceof Error ? error.message : "unknown error"}). Tesseract was used instead.`;
    }
  }
  const result = await runTesseract(image, settings.tesseractLanguage);
  return { engine: "tesseract", warning, ...result };
}
