import "server-only";

import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { normalizeCode, parseAmount, saveImportBatch, type ImportIssue, type ImportSummary } from "@/lib/masterdata";
import { parseDate, spreadHours, toIsoDate } from "@/lib/dates";
import { rateOf } from "@/lib/job-card-cost";
import { round3 } from "@/lib/money";

/**
 * Assets (vehicles / equipment). The printed job card's "Code" is the asset code.
 * A job card is matched to its asset by code, then plate no., then chassis no.
 */

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Plates and chassis numbers are compared without spaces and case ("40 / 37025" = "40/37025"). */
export const normalizeIdent = (value: unknown) => String(value ?? "").replace(/\s+/g, "").toUpperCase();

export type AssetBody = {
  code?: unknown;
  description?: unknown;
  category?: unknown;
  location?: unknown;
  make?: unknown;
  model?: unknown;
  serialNo?: unknown;
  chassisNo?: unknown;
  plateNo?: unknown;
  yearOfMake?: unknown;
  purchaseDate?: unknown;
  purchaseValue?: unknown;
  depreciationRate?: unknown;
  notes?: unknown;
  active?: unknown;
};

const text = (value: unknown, max = 200) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

/** Validates an asset body. Returns the Prisma data and a list of problems (empty when valid). */
export function readAsset(body: AssetBody, partial = false) {
  const errors: string[] = [];
  const data: Prisma.AssetUncheckedCreateInput = { code: "" };
  if (!partial || body.code !== undefined) {
    data.code = normalizeCode(body.code);
    if (!data.code) errors.push("Asset code is required");
    else if (data.code.length > 40) errors.push("Asset code is too long (40 characters max)");
  }
  for (const key of ["description", "category", "location", "make", "model", "serialNo", "notes"] as const) {
    if (!partial || body[key] !== undefined) data[key] = text(body[key], key === "notes" ? 1000 : 200);
  }
  if (!partial || body.chassisNo !== undefined) data.chassisNo = normalizeIdent(body.chassisNo).slice(0, 40);
  if (!partial || body.plateNo !== undefined) data.plateNo = normalizeIdent(body.plateNo).slice(0, 30);
  if (!partial || body.yearOfMake !== undefined) {
    const year = parseAmount(body.yearOfMake);
    if (year === null || (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 2100))) errors.push("Year of make must be a year like 2015");
    else data.yearOfMake = year ?? null;
  }
  if (!partial || body.purchaseDate !== undefined) {
    const empty = body.purchaseDate === null || body.purchaseDate === undefined || body.purchaseDate === "";
    const date = empty ? null : parseDate(body.purchaseDate);
    if (!empty && !date) errors.push("Purchase date is not a valid date (DD/MM/YYYY)");
    else data.purchaseDate = date;
  }
  if (!partial || body.purchaseValue !== undefined) {
    const value = parseAmount(body.purchaseValue);
    if (value === null || (value !== undefined && (value < 0 || value > 1e9))) errors.push("Purchase value must be a number of 0 or more");
    else data.purchaseValue = value === undefined ? null : new Prisma.Decimal(round3(value));
  }
  if (!partial || body.depreciationRate !== undefined) {
    const rate = parseAmount(body.depreciationRate);
    if (rate === null || (rate !== undefined && (rate < 0 || rate > 100))) errors.push("Depreciation rate must be between 0 and 100 (% per year)");
    else data.depreciationRate = rate === undefined ? null : new Prisma.Decimal(Math.round(rate * 100) / 100);
  }
  if (body.active !== undefined) data.active = !!body.active;
  return { data, errors };
}

export async function createAsset(body: AssetBody) {
  const { data, errors } = readAsset(body);
  if (errors.length) throw new HttpError(400, errors.join("; "));
  if (await prisma.asset.findUnique({ where: { code: data.code } })) throw new HttpError(409, `Asset ${data.code} already exists.`);
  return prisma.asset.create({ data });
}

export async function updateAsset(id: string, body: AssetBody) {
  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Asset not found.");
  const { data, errors } = readAsset(body, true);
  if (errors.length) throw new HttpError(400, errors.join("; "));
  if (body.code !== undefined && data.code !== existing.code && (await prisma.asset.findUnique({ where: { code: data.code } }))) {
    throw new HttpError(409, `Asset ${data.code} already exists.`);
  }
  if (body.code === undefined) delete (data as { code?: string }).code;
  return prisma.asset.update({ where: { id }, data });
}

export type AssetMatch = { id: string; code: string; description: string; plateNo: string; chassisNo: string; active: boolean; by: "code" | "plate" | "chassis" };

/** Finds the asset of a job card: by code, else plate no., else chassis no. */
export async function matchAsset(input: { code?: unknown; plate?: unknown; chassis?: unknown }): Promise<AssetMatch | null> {
  const select = { id: true, code: true, description: true, plateNo: true, chassisNo: true, active: true } as const;
  const code = normalizeCode(input.code);
  if (code) {
    const asset = await prisma.asset.findUnique({ where: { code }, select });
    if (asset) return { ...asset, by: "code" };
  }
  const plate = normalizeIdent(input.plate);
  if (plate) {
    const assets = await prisma.asset.findMany({ where: { plateNo: plate }, select, take: 2 });
    if (assets.length === 1) return { ...assets[0], by: "plate" };
  }
  const chassis = normalizeIdent(input.chassis);
  if (chassis) {
    const assets = await prisma.asset.findMany({ where: { chassisNo: chassis }, select, take: 2 });
    if (assets.length === 1) return { ...assets[0], by: "chassis" };
  }
  return null;
}

/** The asset's open job card (other than the given one), if any. */
export function openJobCardOf(assetId: string, exceptJobCardId?: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.jobCard.findFirst({
    where: { assetId, status: "OPEN", active: true, ...(exceptJobCardId ? { id: { not: exceptJobCardId } } : {}) },
    select: { id: true, code: true, dateIn: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Straight-line book value: purchase value minus rate% of it per year since the purchase date (never below 0). */
export function bookValue(asset: { purchaseValue: Prisma.Decimal | null; depreciationRate: Prisma.Decimal | null; purchaseDate: Date | null }, at = new Date()) {
  if (asset.purchaseValue === null) return null;
  const value = Number(asset.purchaseValue);
  if (asset.depreciationRate === null || !asset.purchaseDate) return round3(value);
  const years = Math.max(0, (at.getTime() - asset.purchaseDate.getTime()) / YEAR_MS);
  return round3(Math.max(0, value * (1 - (Number(asset.depreciationRate) / 100) * years)));
}

export type AssetCardCost = { jobCardId: string; labour: number; parts: number; hours: number; total: number };

/** Labour + parts per job card of the given assets, plus the same split by month (YYYY-MM). */
export async function assetCosts(assetIds: string[]) {
  const [records, movements] = await Promise.all([
    prisma.manHourRecord.findMany({
      where: { jobCard: { assetId: { in: assetIds } } },
      select: {
        jobCardId: true,
        startDate: true,
        endDate: true,
        hours: true,
        hourlyRate: true,
        employee: { select: { hourlyRate: true } },
        jobCard: { select: { assetId: true } },
      },
    }),
    prisma.stockMovement.findMany({
      where: { kind: { in: ["ISSUE", "ISSUE_REVERSAL"] }, jobCard: { assetId: { in: assetIds } } },
      select: { jobCardId: true, qty: true, unitCost: true, createdAt: true, jobCard: { select: { assetId: true } } },
    }),
  ]);
  const byCard = new Map<string, AssetCardCost>();
  const byAsset = new Map<string, { labour: number; parts: number }>();
  const byMonth = new Map<string, { labour: number; parts: number }>();
  const card = (id: string) => {
    const entry = byCard.get(id) ?? { jobCardId: id, labour: 0, parts: 0, hours: 0, total: 0 };
    byCard.set(id, entry);
    return entry;
  };
  const bucket = (map: Map<string, { labour: number; parts: number }>, key: string) => {
    const entry = map.get(key) ?? { labour: 0, parts: 0 };
    map.set(key, entry);
    return entry;
  };
  for (const record of records) {
    const hours = Number(record.hours);
    const rate = rateOf(record);
    const entry = card(record.jobCardId);
    entry.hours += hours;
    entry.labour += hours * rate;
    if (record.jobCard.assetId) bucket(byAsset, record.jobCard.assetId).labour += hours * rate;
    // Labour is spread over the days the record covers, so long jobs land in the right months.
    for (const day of spreadHours(record.startDate, record.endDate, hours)) bucket(byMonth, toIsoDate(day.day).slice(0, 7)).labour += day.hours * rate;
  }
  for (const movement of movements) {
    if (!movement.jobCardId) continue;
    const cost = -Number(movement.qty) * Number(movement.unitCost);
    card(movement.jobCardId).parts += cost;
    if (movement.jobCard?.assetId) bucket(byAsset, movement.jobCard.assetId).parts += cost;
    // Kuwait time (UTC+3) for the month of the issue
    bucket(byMonth, new Date(movement.createdAt.getTime() + 3 * 3600_000).toISOString().slice(0, 7)).parts += cost;
  }
  for (const entry of byCard.values()) {
    entry.labour = round3(entry.labour);
    entry.parts = round3(entry.parts);
    entry.hours = Math.round(entry.hours * 100) / 100;
    entry.total = round3(entry.labour + entry.parts);
  }
  const finish = (map: Map<string, { labour: number; parts: number }>) =>
    new Map(Array.from(map, ([key, v]) => [key, { labour: round3(v.labour), parts: round3(v.parts), total: round3(v.labour + v.parts) }]));
  return { byCard, byAsset: finish(byAsset), byMonth: finish(byMonth) };
}

export type AssetImportInput = AssetBody & { row: number };

/**
 * Creates assets from Excel, or updates the asset when its code already exists.
 * On an update only the filled-in cells change the asset; blank cells keep what is stored.
 * A code repeated in the same file is skipped after its first row.
 */
export async function importAssets(items: AssetImportInput[], meta: { source: DataSource; actorId: string; fileName?: string }): Promise<ImportSummary> {
  const issues: ImportIssue[] = [];
  const codes = items.map((item) => normalizeCode(item.code));
  const existing = new Map(
    (await prisma.asset.findMany({ where: { code: { in: codes.filter(Boolean) } }, select: { id: true, code: true } })).map((a) => [a.code, a.id]),
  );
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;
  for (const [index, item] of items.entries()) {
    const code = codes[index];
    if (code && seen.has(code)) {
      issues.push({ row: item.row, value: code, reason: "Repeated in this import", status: "skipped" });
      continue;
    }
    const existingId = code ? existing.get(code) : undefined;
    if (existingId) {
      // Only the cells that have a value; the code is the key and stays as it is.
      const filled = Object.fromEntries(
        Object.entries(item).filter(
          ([key, value]) => key !== "row" && key !== "code" && value !== null && value !== undefined && String(value).trim() !== "",
        ),
      ) as AssetBody;
      const { data, errors } = readAsset(filled, true);
      if (errors.length) {
        issues.push({ row: item.row, value: code, reason: errors.join("; "), status: "failed" });
        continue;
      }
      seen.add(code);
      const { code: _key, ...changes } = data;
      void _key;
      if (Object.keys(changes).length === 0) {
        issues.push({ row: item.row, value: code, reason: "Asset exists and the row has nothing to update", status: "skipped" });
        continue;
      }
      await prisma.asset.update({ where: { id: existingId }, data: changes });
      updated += 1;
      continue;
    }
    const { data, errors } = readAsset(item);
    if (errors.length) {
      issues.push({ row: item.row, value: code || String(item.description ?? ""), reason: errors.join("; "), status: "failed" });
      continue;
    }
    seen.add(code);
    try {
      await prisma.asset.create({ data });
      created += 1;
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") issues.push({ row: item.row, value: code, reason: "Asset code already exists", status: "skipped" });
      else throw error;
    }
  }
  const summary = {
    totalRows: items.length,
    created,
    updated,
    skipped: issues.filter((issue) => issue.status === "skipped").length,
    failed: issues.filter((issue) => issue.status === "failed").length,
    issues,
  };
  const batchId = await saveImportBatch("ASSETS", meta, summary);
  return { batchId, ...summary };
}
