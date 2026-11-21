import "server-only";

import { stat } from "fs/promises";
import path from "path";
import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";
import { normalizeCode, parseAmount, saveImportBatch, type ImportIssue, type ImportSummary } from "@/lib/masterdata";
import { getFieldDefinitions, toFieldDefs, validateCustomFields } from "@/lib/fields";
import { matchAsset, normalizeIdent, openJobCardOf, readAsset, type AssetBody, type AssetMatch } from "@/lib/assets";
import { parseDate, toIsoDate } from "@/lib/dates";
import { appConfig } from "@/lib/env";
import { audit } from "@/lib/audit";

/**
 * Adding job cards with the printed header of the original card (photo, typed, Excel, API).
 * Rules: the job card number must be new; an asset may have only one open job card (admins can add another).
 */

export const jobCardPhotoRoot = () => path.resolve(process.cwd(), appConfig.uploadDir(), "jobcards");
const PHOTO_PATH = /^\d{4}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

export type TaskInput = { description?: unknown; fromDate?: unknown };

export type JobCardBody = {
  code?: unknown;
  /** Chosen asset; or newAsset to create it from the card; or neither (no asset) */
  assetId?: unknown;
  newAsset?: AssetBody | null;
  dateIn?: unknown;
  dateOut?: unknown;
  previousReading?: unknown;
  currentReading?: unknown;
  jobType?: unknown;
  repairAt?: unknown;
  project?: unknown;
  operatorName?: unknown;
  receivedBy?: unknown;
  createdByName?: unknown;
  tasks?: TaskInput[];
  photoPath?: unknown;
  customFields?: Record<string, unknown>;
  /** Admins only: add even though the asset already has an open job card */
  allowSecondOpen?: unknown;
};

const text = (value: unknown, max = 200) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

type Header = Omit<Prisma.JobCardUncheckedCreateInput, "code">;

/** Validates the printed header fields. `partial` leaves out fields that are not in the body (editing). */
export function readHeader(body: JobCardBody, partial = false) {
  const errors: string[] = [];
  const data: Header = {};
  const has = (key: keyof JobCardBody) => !partial || body[key] !== undefined;
  for (const key of ["dateIn", "dateOut"] as const) {
    if (!has(key)) continue;
    const empty = body[key] === null || body[key] === undefined || body[key] === "";
    const date = empty ? null : parseDate(body[key]);
    if (!empty && !date) errors.push(`${key === "dateIn" ? "Date in" : "Date out"} is not a valid date (DD/MM/YYYY)`);
    else data[key] = date;
  }
  if (data.dateIn && data.dateOut && data.dateOut < data.dateIn) errors.push("Date out is before date in");
  for (const key of ["previousReading", "currentReading"] as const) {
    if (!has(key)) continue;
    const value = parseAmount(typeof body[key] === "string" ? (body[key] as string).replace(/,/g, "") : body[key]);
    if (value === null || (value !== undefined && (value < 0 || value > 1e10))) errors.push(`${key === "previousReading" ? "Previous" : "Current"} HM/KM must be a number of 0 or more`);
    else data[key] = value === undefined ? null : new Prisma.Decimal(Math.round(value * 10) / 10);
  }
  for (const key of ["jobType", "repairAt", "project", "operatorName", "receivedBy", "createdByName"] as const) {
    if (has(key)) data[key] = text(body[key]);
  }
  let tasks: { line: number; description: string; fromDate: Date | null }[] | undefined;
  if (has("tasks")) {
    const list = Array.isArray(body.tasks) ? body.tasks : [];
    if (list.length > 50) errors.push("At most 50 work done lines");
    tasks = list
      .map((task) => ({ description: text(task?.description, 500), fromDate: task?.fromDate ? parseDate(task.fromDate) : null }))
      .filter((task) => task.description)
      .map((task, index) => ({ line: index + 1, ...task }));
  }
  return { data, tasks, errors };
}

/** The photo uploaded by read-photo for this card (relative to uploads/jobcards). */
async function checkPhoto(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  const relative = String(value);
  if (!PHOTO_PATH.test(relative)) throw new HttpError(400, "Invalid photo reference.");
  const file = await stat(path.join(jobCardPhotoRoot(), relative)).catch(() => null);
  if (!file?.isFile()) throw new HttpError(400, "The photo of the card was not found. Upload it again.");
  return relative;
}

export type CardCheck = {
  existing: { id: string; code: string } | null;
  asset: (AssetMatch | (Omit<AssetMatch, "by"> & { by: "chosen" })) | null;
  openCard: { id: string; code: string; dateIn: string } | null;
};

/** Live checks for the review screen: number taken? which asset? does it already have an open card? */
export async function checkCard(input: { code?: unknown; assetId?: unknown; assetCode?: unknown; plateNo?: unknown; chassisNo?: unknown; exceptId?: string }): Promise<CardCheck> {
  const code = normalizeCode(input.code);
  const existing = code
    ? await prisma.jobCard.findFirst({ where: { code, ...(input.exceptId ? { id: { not: input.exceptId } } : {}) }, select: { id: true, code: true } })
    : null;
  let asset: CardCheck["asset"] = null;
  if (typeof input.assetId === "string" && input.assetId) {
    const chosen = await prisma.asset.findUnique({
      where: { id: input.assetId },
      select: { id: true, code: true, description: true, plateNo: true, chassisNo: true, active: true },
    });
    if (chosen) asset = { ...chosen, by: "chosen" };
  } else {
    asset = await matchAsset({ code: input.assetCode, plate: input.plateNo, chassis: input.chassisNo });
  }
  const open = asset ? await openJobCardOf(asset.id, input.exceptId) : null;
  return { existing, asset, openCard: open ? { id: open.id, code: open.code, dateIn: toIsoDate(open.dateIn) } : null };
}

/** Per-asset lock so two people can't open two job cards for one asset at the same moment. */
async function lockAsset(tx: Prisma.TransactionClient, assetId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset-open-card:${assetId}`}))`;
}

class OpenCardError extends HttpError {}

function openCardMessage(assetCode: string, card: { code: string }) {
  return `Asset ${assetCode} already has an open job card (${card.code}). Close it first; only an admin can add a second open job card.`;
}

/** Creates a job card from the review screen (photo or typed). */
export async function createJobCard(user: CurrentUser, body: JobCardBody, source: DataSource) {
  const code = normalizeCode(body.code);
  if (!code) throw new HttpError(400, "Job card number is required.");
  if (code.length > 100) throw new HttpError(400, "Job card number is longer than 100 characters.");
  const { data, tasks, errors } = readHeader(body);
  const custom = validateCustomFields(toFieldDefs(await getFieldDefinitions("JOB_CARD")), body.customFields);
  errors.push(...custom.errors);
  let newAsset: Prisma.AssetUncheckedCreateInput | null = null;
  if (body.newAsset) {
    const parsed = readAsset(body.newAsset);
    errors.push(...parsed.errors.map((e) => `New asset: ${e}`));
    newAsset = parsed.data;
  }
  if (errors.length) throw new HttpError(400, errors.join("; "), errors);
  const photoPath = await checkPhoto(body.photoPath);
  const override = body.allowSecondOpen === true && user.isAdmin;

  const card = await prisma.$transaction(async (tx) => {
    if (await tx.jobCard.findUnique({ where: { code } })) throw new HttpError(409, `Job card ${code} already exists.`);
    let assetId: string | null = null;
    let assetCode = "";
    if (newAsset) {
      if (await tx.asset.findUnique({ where: { code: newAsset.code } })) {
        throw new HttpError(409, `Asset ${newAsset.code} already exists: choose it instead of creating it.`);
      }
      const created = await tx.asset.create({ data: newAsset });
      assetId = created.id;
      assetCode = created.code;
    } else if (typeof body.assetId === "string" && body.assetId) {
      const asset = await tx.asset.findUnique({ where: { id: body.assetId } });
      if (!asset) throw new HttpError(400, "The chosen asset was not found.");
      assetId = asset.id;
      assetCode = asset.code;
    }
    if (assetId) {
      await lockAsset(tx, assetId);
      const open = await openJobCardOf(assetId, undefined, tx);
      if (open && !override) throw new OpenCardError(409, openCardMessage(assetCode, open), { openCard: open });
    }
    return tx.jobCard.create({
      data: {
        code,
        ...data,
        assetId,
        photoPath,
        source,
        addedById: user.id,
        customFields: custom.values as Prisma.InputJsonValue,
        tasks: tasks?.length ? { create: tasks } : undefined,
      },
    });
  });
  await audit(user.id, "JOB_CARD_CREATED", "JobCard", card.id, {
    code,
    assetId: card.assetId,
    newAsset: newAsset?.code,
    photo: !!photoPath,
    ...(override ? { secondOpenCardByAdmin: true } : {}),
  });
  return card;
}

/** Edits the printed details of a job card ("Edit job card details"). */
export async function updateJobCardDetails(user: CurrentUser, id: string, body: JobCardBody & { active?: unknown }) {
  const existing = await prisma.jobCard.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Job card not found.");
  const code = body.code !== undefined ? normalizeCode(body.code) : existing.code;
  if (!code) throw new HttpError(400, "Job card number is required.");
  const { data, tasks, errors } = readHeader(body, true);
  let customFields: Prisma.InputJsonValue | undefined;
  if (body.customFields) {
    const custom = validateCustomFields(toFieldDefs(await getFieldDefinitions("JOB_CARD")), body.customFields);
    errors.push(...custom.errors);
    customFields = custom.values as Prisma.InputJsonValue;
  }
  let newAsset: Prisma.AssetUncheckedCreateInput | null = null;
  if (body.newAsset) {
    const parsed = readAsset(body.newAsset);
    errors.push(...parsed.errors.map((e) => `New asset: ${e}`));
    newAsset = parsed.data;
  }
  if (errors.length) throw new HttpError(400, errors.join("; "), errors);
  const override = body.allowSecondOpen === true && user.isAdmin;

  await prisma.$transaction(async (tx) => {
    if (code !== existing.code && (await tx.jobCard.findUnique({ where: { code } }))) throw new HttpError(409, `Job card ${code} already exists.`);
    let assetId = existing.assetId;
    if (newAsset) {
      if (await tx.asset.findUnique({ where: { code: newAsset.code } })) {
        throw new HttpError(409, `Asset ${newAsset.code} already exists: choose it instead of creating it.`);
      }
      assetId = (await tx.asset.create({ data: newAsset })).id;
    } else if (body.assetId !== undefined) {
      assetId = typeof body.assetId === "string" && body.assetId ? body.assetId : null;
      if (assetId) {
        const asset = await tx.asset.findUnique({ where: { id: assetId } });
        if (!asset) throw new HttpError(400, "The chosen asset was not found.");
        if (assetId !== existing.assetId && existing.status === "OPEN") {
          await lockAsset(tx, assetId);
          const open = await openJobCardOf(assetId, id, tx);
          if (open && !override) throw new OpenCardError(409, openCardMessage(asset.code, open), { openCard: open });
        }
      }
    }
    await tx.jobCard.update({
      where: { id },
      data: {
        code,
        ...data,
        assetId,
        ...(body.active !== undefined ? { active: !!body.active } : {}),
        ...(customFields ? { customFields } : {}),
      },
    });
    if (tasks) {
      await tx.jobCardTask.deleteMany({ where: { jobCardId: id } });
      if (tasks.length) await tx.jobCardTask.createMany({ data: tasks.map((task) => ({ ...task, jobCardId: id })) });
    }
  });
  await audit(user.id, "JOB_CARD_UPDATED", "JobCard", id, { ...body, tasks: tasks?.length });
}

/** Reopening a closed card counts as a new open card for its asset. */
export async function assertCanReopen(user: CurrentUser, card: { id: string; assetId: string | null }) {
  if (!card.assetId || user.isAdmin) return;
  const open = await openJobCardOf(card.assetId, card.id);
  if (open) {
    const asset = await prisma.asset.findUnique({ where: { id: card.assetId }, select: { code: true } });
    throw new HttpError(409, openCardMessage(asset?.code ?? "", open));
  }
}

export type JobCardImportInput = {
  row: number;
  code: unknown;
  fields?: Record<string, unknown>;
  assetCode?: unknown;
  plateNo?: unknown;
  chassisNo?: unknown;
  workDone?: unknown;
} & Omit<JobCardBody, "code" | "tasks" | "assetId" | "newAsset" | "photoPath" | "customFields" | "allowSecondOpen">;

type BatchMeta = { source: DataSource; actorId?: string | null; apiKeyId?: string | null; fileName?: string; isAdmin?: boolean };

/**
 * Creates job cards from Excel / the API. Existing numbers (and repeats) are skipped, never updated.
 * An asset given by code / plate / chassis must exist; a card for an asset that already has an open one is rejected
 * (admins' imports excepted).
 */
export async function importJobCards(items: JobCardImportInput[], meta: BatchMeta, recordBatch = true): Promise<ImportSummary> {
  const fieldDefs = toFieldDefs(await getFieldDefinitions("JOB_CARD"));
  const issues: ImportIssue[] = [];
  const codes = items.map((item) => normalizeCode(item.code));
  const existing = new Set(
    (await prisma.jobCard.findMany({ where: { code: { in: codes.filter(Boolean) } }, select: { code: true } })).map((card) => card.code),
  );
  const seen = new Set<string>();
  let created = 0;

  for (const [index, item] of items.entries()) {
    const code = codes[index];
    const fail = (reason: string, status: ImportIssue["status"] = "failed") => issues.push({ row: item.row, value: code, reason, status });
    if (!code) {
      fail("Job card ID is empty");
      continue;
    }
    if (code.length > 100) {
      fail("Job card ID is longer than 100 characters");
      continue;
    }
    if (existing.has(code) || seen.has(code)) {
      fail(existing.has(code) ? "Job card ID already exists" : "Repeated in this import", "skipped");
      continue;
    }
    const tasks = String(item.workDone ?? "")
      .split(/[;\n]/)
      .map((description) => ({ description: description.trim() }))
      .filter((task) => task.description);
    const { data, tasks: taskRows, errors } = readHeader({ ...item, tasks: tasks.length ? tasks : undefined }, true);
    const custom = validateCustomFields(fieldDefs, item.fields);
    errors.push(...custom.errors);
    const wantsAsset = !!(normalizeCode(item.assetCode) || normalizeIdent(item.plateNo) || normalizeIdent(item.chassisNo));
    const asset = wantsAsset ? await matchAsset({ code: item.assetCode, plate: item.plateNo, chassis: item.chassisNo }) : null;
    if (wantsAsset && !asset) errors.push("Asset not found (add it on the Assets page first)");
    if (errors.length) {
      fail(errors.join("; "));
      continue;
    }
    seen.add(code);
    try {
      await prisma.$transaction(async (tx) => {
        if (asset) {
          await lockAsset(tx, asset.id);
          const open = await openJobCardOf(asset.id, undefined, tx);
          if (open && !meta.isAdmin) throw new OpenCardError(409, `Asset ${asset.code} already has an open job card (${open.code})`);
        }
        await tx.jobCard.create({
          data: {
            code,
            ...data,
            assetId: asset?.id ?? null,
            source: meta.source,
            addedById: meta.actorId ?? null,
            customFields: custom.values as Prisma.InputJsonValue,
            tasks: taskRows?.length ? { create: taskRows } : undefined,
          },
        });
      });
      created += 1;
    } catch (error) {
      if (error instanceof OpenCardError) fail(error.message);
      else if ((error as { code?: string }).code === "P2002") fail("Job card ID already exists", "skipped");
      else throw error;
    }
  }

  const summary = {
    totalRows: items.length,
    created,
    skipped: issues.filter((issue) => issue.status === "skipped").length,
    failed: issues.filter((issue) => issue.status === "failed").length,
    issues,
  };
  const batchId = recordBatch ? await saveImportBatch("JOB_CARDS", meta, summary) : null;
  return { batchId, ...summary };
}
