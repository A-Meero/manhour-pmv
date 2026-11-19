import "server-only";

import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import { normalizeCode, parseAmount, saveImportBatch, type ImportIssue, type ImportSummary } from "@/lib/masterdata";
import { audit } from "@/lib/audit";

/**
 * Simple stock: each part has a quantity on hand and a unit cost. Every change is a StockMovement:
 * RECEIVE (+), ADJUST (±, stock count corrections), ISSUE (− to a job card), ISSUE_REVERSAL (+, undoes a mistaken issue).
 */

const MAX_QTY = 1_000_000_000;

export type PartBody = { partNo?: unknown; name?: unknown; unit?: unknown; unitCost?: unknown; minQty?: unknown; active?: boolean };

function readPart(body: PartBody, requireAll: boolean) {
  const data: Prisma.PartUpdateInput = {};
  if (body.partNo !== undefined || requireAll) {
    const partNo = normalizeCode(body.partNo);
    if (!partNo) throw new HttpError(400, "Part no. is required.");
    if (partNo.length > 100) throw new HttpError(400, "Part no. is longer than 100 characters.");
    data.partNo = partNo;
  }
  if (body.name !== undefined || requireAll) {
    const name = String(body.name ?? "").trim();
    if (!name) throw new HttpError(400, "Part name is required.");
    data.name = name;
  }
  if (body.unit !== undefined) data.unit = String(body.unit ?? "").trim() || "pcs";
  if (body.unitCost !== undefined || requireAll) {
    const cost = parseAmount(body.unitCost);
    if (cost === null || cost === undefined || cost < 0 || cost > 9999999) throw new HttpError(400, "Unit cost must be a number of 0 or more.");
    data.unitCost = new Prisma.Decimal(cost);
  }
  if (body.minQty !== undefined) {
    const min = parseAmount(body.minQty);
    if (min === null || (min !== undefined && min < 0)) throw new HttpError(400, "Low stock level must be a number of 0 or more.");
    data.minQty = min === undefined ? null : new Prisma.Decimal(min);
  }
  if (body.active !== undefined) data.active = !!body.active;
  return data;
}

export async function createPart(user: CurrentUser, body: PartBody & { openingQty?: unknown }) {
  const data = readPart(body, true) as Prisma.PartCreateInput;
  const parsedOpening = parseAmount(body.openingQty);
  if (parsedOpening === null) throw new HttpError(400, "Opening stock must be a number.");
  const opening = parsedOpening ?? 0;
  if (opening < 0 || opening > MAX_QTY) throw new HttpError(400, "Opening stock must be 0 or more.");
  try {
    const part = await prisma.$transaction(async (tx) => {
      const created = await tx.part.create({ data: { ...data, qtyOnHand: new Prisma.Decimal(opening) } });
      if (opening > 0) {
        await tx.stockMovement.create({
          data: { partId: created.id, kind: "RECEIVE", qty: new Prisma.Decimal(opening), unitCost: created.unitCost, note: "Opening stock", userId: user.id },
        });
      }
      return created;
    });
    await audit(user.id, "PART_CREATED", "Part", part.id, { partNo: part.partNo, opening });
    return part;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new HttpError(409, `Part no. ${String(data.partNo)} already exists.`);
    throw error;
  }
}

export async function updatePart(user: CurrentUser, id: string, body: PartBody) {
  const data = readPart(body, false);
  try {
    await prisma.part.update({ where: { id }, data });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") throw new HttpError(409, `Part no. ${String(data.partNo)} already exists.`);
    if (code === "P2025") throw new HttpError(404, "Part not found.");
    throw error;
  }
  await audit(user.id, "PART_UPDATED", "Part", id, body);
}

/** RECEIVE adds stock (optionally updating the unit cost to the new purchase price); ADJUST sets a counted quantity. */
export async function changeStock(
  user: CurrentUser,
  partId: string,
  body: { kind?: string; qty?: unknown; countedQty?: unknown; unitCost?: unknown; note?: unknown },
) {
  const note = String(body.note ?? "").trim();
  const result = await prisma.$transaction(async (tx) => {
    const part = await lockPart(tx, partId);
    if (body.kind === "RECEIVE") {
      const qty = parseAmount(body.qty);
      if (!qty || qty <= 0 || qty > MAX_QTY) throw new HttpError(400, "Enter the quantity received (more than 0).");
      const newCost = parseAmount(body.unitCost);
      if (newCost === null || (newCost !== undefined && newCost < 0)) throw new HttpError(400, "Unit cost must be a number of 0 or more.");
      const unitCost = newCost === undefined ? part.unitCost : new Prisma.Decimal(newCost);
      await tx.part.update({ where: { id: partId }, data: { qtyOnHand: { increment: qty }, unitCost } });
      return tx.stockMovement.create({ data: { partId, kind: "RECEIVE", qty: new Prisma.Decimal(qty), unitCost, note, userId: user.id } });
    }
    if (body.kind === "ADJUST") {
      const counted = parseAmount(body.countedQty);
      if (counted === null || counted === undefined || counted < 0 || counted > MAX_QTY) throw new HttpError(400, "Enter the counted quantity (0 or more).");
      const diff = counted - Number(part.qtyOnHand);
      if (Math.abs(diff) < 0.0005) throw new HttpError(400, "The counted quantity is the same as the stock on hand.");
      if (!note) throw new HttpError(400, "Write a reason for the adjustment.");
      await tx.part.update({ where: { id: partId }, data: { qtyOnHand: new Prisma.Decimal(counted) } });
      return tx.stockMovement.create({ data: { partId, kind: "ADJUST", qty: new Prisma.Decimal(diff), unitCost: part.unitCost, note, userId: user.id } });
    }
    throw new HttpError(400, "Unknown stock change.");
  });
  await audit(user.id, `STOCK_${result.kind}`, "Part", partId, { qty: Number(result.qty), note });
}

async function lockPart(tx: Prisma.TransactionClient, partId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Part" WHERE id = ${partId} FOR UPDATE`;
  if (!rows.length) throw new HttpError(404, "Part not found.");
  return tx.part.findUniqueOrThrow({ where: { id: partId } });
}

/** Issues parts from stock to an open job card, at their current unit cost. All lines succeed or none do. */
export async function issueParts(user: CurrentUser, jobCardId: string, lines: { partId?: string; qty?: unknown }[], note?: unknown) {
  const card = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
  if (!card) throw new HttpError(404, "Job card not found.");
  if (!card.active) throw new HttpError(400, "This job card is inactive.");
  if (card.status === "CLOSED" && !isAdmin(user)) throw new HttpError(400, "This job card is closed.");
  const clean = lines
    .map((line) => ({ partId: String(line.partId ?? ""), qty: parseAmount(line.qty) }))
    .filter((line) => line.partId);
  if (!clean.length) throw new HttpError(400, "Choose at least one part.");
  const merged = new Map<string, number>();
  for (const line of clean) {
    if (!line.qty || line.qty <= 0) throw new HttpError(400, "Each quantity must be more than 0.");
    merged.set(line.partId, (merged.get(line.partId) ?? 0) + line.qty);
  }
  const text = String(note ?? "").trim();
  const issued = await prisma.$transaction(async (tx) => {
    const out: { partNo: string; qty: number }[] = [];
    // Lock in a fixed order so two issues at once can't deadlock.
    for (const [partId, qty] of Array.from(merged.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      const part = await lockPart(tx, partId);
      if (!part.active) throw new HttpError(400, `${part.partNo} is inactive.`);
      if (Number(part.qtyOnHand) + 0.0005 < qty) {
        throw new HttpError(400, `Not enough ${part.partNo} (${part.name}) in stock: ${Number(part.qtyOnHand)} ${part.unit} left.`);
      }
      await tx.part.update({ where: { id: partId }, data: { qtyOnHand: { decrement: qty } } });
      await tx.stockMovement.create({
        data: { partId, kind: "ISSUE", qty: new Prisma.Decimal(-qty), unitCost: part.unitCost, jobCardId, note: text, userId: user.id },
      });
      out.push({ partNo: part.partNo, qty });
    }
    return out;
  });
  await audit(user.id, "PARTS_ISSUED", "JobCard", jobCardId, { code: card.code, parts: issued });
  return issued;
}

/** Undoes one mistaken issue line: the quantity goes back to stock. */
export async function reverseIssue(user: CurrentUser, movementId: string, note?: unknown) {
  const reason = String(note ?? "").trim();
  if (!reason) throw new HttpError(400, "Write a reason for returning this line.");
  const result = await prisma.$transaction(async (tx) => {
    const issue = await tx.stockMovement.findUnique({ where: { id: movementId }, include: { reversal: true, jobCard: true } });
    if (!issue || issue.kind !== "ISSUE") throw new HttpError(404, "Issue line not found.");
    if (issue.reversal) throw new HttpError(400, "This line was already returned.");
    if (issue.jobCard?.status === "CLOSED" && !isAdmin(user)) throw new HttpError(400, "The job card is closed.");
    await lockPart(tx, issue.partId);
    const qty = -Number(issue.qty);
    await tx.part.update({ where: { id: issue.partId }, data: { qtyOnHand: { increment: qty } } });
    return tx.stockMovement.create({
      data: {
        partId: issue.partId,
        kind: "ISSUE_REVERSAL",
        qty: new Prisma.Decimal(qty),
        unitCost: issue.unitCost,
        jobCardId: issue.jobCardId,
        reversesId: issue.id,
        note: reason,
        userId: user.id,
      },
    });
  });
  await audit(user.id, "PARTS_ISSUE_REVERSED", "StockMovement", movementId, { reason });
  return result;
}

export type PartImportInput = { row: number; partNo: unknown; name: unknown; unit?: unknown; unitCost: unknown; qtyOnHand?: unknown; minQty?: unknown };

/** Creates parts from Excel. Existing part numbers (and repeats in the file) are skipped, never updated. */
export async function importParts(items: PartImportInput[], meta: { source: DataSource; actorId: string; fileName?: string }): Promise<ImportSummary> {
  const issues: ImportIssue[] = [];
  const codes = items.map((item) => normalizeCode(item.partNo));
  const existing = new Set(
    (await prisma.part.findMany({ where: { partNo: { in: codes.filter(Boolean) } }, select: { partNo: true } })).map((p) => p.partNo),
  );
  const seen = new Set<string>();
  let created = 0;
  for (const [index, item] of items.entries()) {
    const partNo = codes[index];
    if (!partNo) {
      issues.push({ row: item.row, value: String(item.name ?? ""), reason: "Part no. is empty", status: "failed" });
      continue;
    }
    if (existing.has(partNo) || seen.has(partNo)) {
      issues.push({ row: item.row, value: partNo, reason: existing.has(partNo) ? "Part no. already exists" : "Repeated in this import", status: "skipped" });
      continue;
    }
    const name = String(item.name ?? "").trim();
    const unitCost = parseAmount(item.unitCost);
    const qty = parseAmount(item.qtyOnHand);
    const minQty = parseAmount(item.minQty);
    const errors: string[] = [];
    if (!name) errors.push("Part name is required");
    if (unitCost === null || unitCost === undefined || unitCost < 0) errors.push("Unit cost must be a number of 0 or more");
    if (qty === null || (qty !== undefined && (qty < 0 || qty > MAX_QTY))) errors.push("Opening stock must be 0 or more");
    if (minQty === null || (minQty !== undefined && minQty < 0)) errors.push("Low stock level must be 0 or more");
    if (errors.length) {
      issues.push({ row: item.row, value: partNo, reason: errors.join("; "), status: "failed" });
      continue;
    }
    seen.add(partNo);
    try {
      await prisma.$transaction(async (tx) => {
        const part = await tx.part.create({
          data: {
            partNo,
            name,
            unit: String(item.unit ?? "").trim() || "pcs",
            unitCost: new Prisma.Decimal(unitCost as number),
            qtyOnHand: new Prisma.Decimal((qty as number | undefined) ?? 0),
            minQty: minQty === undefined || minQty === null ? null : new Prisma.Decimal(minQty),
          },
        });
        if (qty) {
          await tx.stockMovement.create({
            data: { partId: part.id, kind: "RECEIVE", qty: new Prisma.Decimal(qty), unitCost: part.unitCost, note: "Opening stock (import)", userId: meta.actorId },
          });
        }
      });
      created += 1;
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") issues.push({ row: item.row, value: partNo, reason: "Part no. already exists", status: "skipped" });
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
  const batchId = await saveImportBatch("PARTS", meta, summary);
  return { batchId, ...summary };
}
