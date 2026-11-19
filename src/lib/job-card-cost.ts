import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { round3 } from "@/lib/money";

/**
 * Labour = record hours × the employee's hourly rate when the record was saved (current rate for older records).
 * Parts = quantity issued to the card × the part's unit cost at issue time, minus reversals.
 */

export const rateOf = (record: { hourlyRate: Prisma.Decimal | null; employee: { hourlyRate: Prisma.Decimal } }) =>
  Number(record.hourlyRate ?? record.employee.hourlyRate);

export async function getJobCardCost(jobCardId: string) {
  const [records, movements] = await Promise.all([
    prisma.manHourRecord.findMany({
      where: { jobCardId },
      select: {
        id: true,
        hours: true,
        hourlyRate: true,
        source: true,
        employeeId: true,
        employee: { select: { fileNo: true, name: true, hourlyRate: true } },
      },
      orderBy: { employeeName: "asc" },
    }),
    prisma.stockMovement.findMany({
      where: { jobCardId, kind: { in: ["ISSUE", "ISSUE_REVERSAL"] } },
      include: { part: { select: { partNo: true, name: true, unit: true } }, user: { select: { name: true } }, reversal: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const labour = records.map((record) => {
    const hours = Number(record.hours);
    const rate = rateOf(record);
    return { ...record, hours, rate, cost: round3(hours * rate) };
  });
  const parts = movements.map((movement) => {
    const qty = -Number(movement.qty); // issues are stored as negative stock changes
    const unitCost = Number(movement.unitCost);
    return { ...movement, qty, unitCost, cost: round3(qty * unitCost) };
  });
  const labourTotal = round3(labour.reduce((sum, line) => sum + line.cost, 0));
  const partsTotal = round3(parts.reduce((sum, line) => sum + line.cost, 0));
  const hoursTotal = Math.round(labour.reduce((sum, line) => sum + line.hours, 0) * 100) / 100;
  return { labour, parts, labourTotal, partsTotal, hoursTotal, total: round3(labourTotal + partsTotal) };
}

/** Totals for many job cards at once (analytics). */
export async function costsByJobCard(where: Prisma.ManHourRecordWhereInput, movementWhere: Prisma.StockMovementWhereInput) {
  const [records, movements] = await Promise.all([
    prisma.manHourRecord.findMany({
      where,
      select: { jobCardId: true, hours: true, hourlyRate: true, employee: { select: { hourlyRate: true } }, jobCard: { select: { code: true } } },
    }),
    prisma.stockMovement.findMany({
      where: { ...movementWhere, kind: { in: ["ISSUE", "ISSUE_REVERSAL"] }, jobCardId: { not: null } },
      select: { jobCardId: true, qty: true, unitCost: true, jobCard: { select: { code: true } } },
    }),
  ]);
  const byCard = new Map<string, { code: string; labour: number; parts: number }>();
  const entry = (id: string, code: string) => {
    const existing = byCard.get(id) ?? { code, labour: 0, parts: 0 };
    byCard.set(id, existing);
    return existing;
  };
  for (const record of records) entry(record.jobCardId, record.jobCard.code).labour += Number(record.hours) * rateOf(record);
  for (const movement of movements) {
    if (!movement.jobCardId || !movement.jobCard) continue;
    entry(movement.jobCardId, movement.jobCard.code).parts += -Number(movement.qty) * Number(movement.unitCost);
  }
  return Array.from(byCard.values())
    .map((card) => ({ code: card.code, labour: round3(card.labour), parts: round3(card.parts), total: round3(card.labour + card.parts) }))
    .sort((a, b) => b.total - a.total);
}
