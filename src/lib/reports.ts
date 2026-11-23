import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { seesAllRecords } from "@/lib/auth/access";
import { canRunReport, canViewReports, isReportKind, REPORTS, type ReportKind } from "@/lib/reports-access";
import { HttpError } from "@/lib/http";
import { rateOf } from "@/lib/job-card-cost";
import { bookValue } from "@/lib/assets";
import { addDays, formatDate, parseDate, toIsoDate } from "@/lib/dates";
import { round3 } from "@/lib/money";
import { REPAIR_TYPE_LABEL } from "@/lib/repair-type";
import { buildSheet } from "@/lib/excel";

/**
 * Excel reports for a date range (From / To, inclusive). Hours and labour count records by their start date; parts count
 * issues / returns by their date (Kuwait time).
 */

export { REPORTS, canRunReport, canViewReports, isReportKind, type ReportKind };

export function reportRange(fromText: string | null, toText: string | null) {
  const from = parseDate(fromText);
  const to = parseDate(toText);
  if (!from || !to) throw new HttpError(400, "Choose the From and To dates.");
  if (to < from) throw new HttpError(400, "To is before From.");
  if (to.getTime() - from.getTime() > 3 * 366 * 86400_000) throw new HttpError(400, "Choose a period of at most 3 years.");
  // Stock movements are stored in UTC; the period is in Kuwait days (UTC+3).
  return { from, to, movedFrom: new Date(from.getTime() - 3 * 3600_000), movedBefore: new Date(addDays(to, 1).getTime() - 3 * 3600_000) };
}

type Range = ReturnType<typeof reportRange>;

async function periodActivity(range: Range, recordEmployeeIds?: string[]) {
  const [records, movements] = await Promise.all([
    prisma.manHourRecord.findMany({
      where: { startDate: { gte: range.from, lte: range.to }, ...(recordEmployeeIds ? { employeeId: { in: recordEmployeeIds } } : {}) },
      select: {
        jobCardId: true,
        employeeId: true,
        hours: true,
        hourlyRate: true,
        employee: { select: { fileNo: true, name: true, hourlyRate: true } },
      },
    }),
    prisma.stockMovement.findMany({
      where: { kind: { in: ["ISSUE", "ISSUE_REVERSAL"] }, jobCardId: { not: null }, createdAt: { gte: range.movedFrom, lt: range.movedBefore } },
      include: { part: { select: { partNo: true, name: true, unit: true } }, user: { select: { name: true } }, jobCard: { select: { code: true, asset: { select: { code: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { records, movements };
}

/** Builds the report's workbook and file name. */
export async function buildReport(user: CurrentUser, kind: ReportKind, range: Range): Promise<{ data: ArrayBuffer; fileName: string }> {
  if (!canRunReport(user, kind)) throw new HttpError(403, "You do not have permission for this report.");
  const suffix = `${toIsoDate(range.from)}_to_${toIsoDate(range.to)}`;

  if (kind === "job-card-costs" || kind === "asset-costs") {
    const { records, movements } = await periodActivity(range);
    const perCard = new Map<string, { hours: number; labour: number; parts: number }>();
    const entry = (id: string) => {
      const e = perCard.get(id) ?? { hours: 0, labour: 0, parts: 0 };
      perCard.set(id, e);
      return e;
    };
    for (const r of records) {
      const e = entry(r.jobCardId);
      e.hours += Number(r.hours);
      e.labour += Number(r.hours) * rateOf(r);
    }
    for (const m of movements) if (m.jobCardId) entry(m.jobCardId).parts += -Number(m.qty) * Number(m.unitCost);
    // Cards that came in during the period count too, even with no cost yet.
    const cameIn = await prisma.jobCard.findMany({ where: { dateIn: { gte: range.from, lte: range.to } }, select: { id: true } });
    for (const c of cameIn) entry(c.id);
    const cards = await prisma.jobCard.findMany({
      where: { id: { in: [...perCard.keys()] } },
      include: { asset: true },
      orderBy: { code: "asc" },
    });

    if (kind === "job-card-costs") {
      const data = await buildSheet(
        "Job card costs",
        [
          { header: "Job Card", key: "code", width: 16 },
          { header: "Asset", key: "asset", width: 12 },
          { header: "Asset Description", key: "description", width: 30 },
          { header: "Type", key: "type", width: 11 },
          { header: "Job Type", key: "jobType", width: 16 },
          { header: "Date In", key: "dateIn", width: 12 },
          { header: "Date Out", key: "dateOut", width: 12 },
          { header: "Status", key: "status", width: 9 },
          { header: "Hours", key: "hours", width: 9 },
          { header: "Labour (KWD)", key: "labour", width: 13 },
          { header: "Parts (KWD)", key: "parts", width: 12 },
          { header: "Total (KWD)", key: "total", width: 12 },
        ],
        cards.map((card) => {
          const e = perCard.get(card.id)!;
          return {
            code: card.code,
            asset: card.asset?.code ?? "",
            description: card.asset?.description ?? "",
            type: card.repairType ? REPAIR_TYPE_LABEL[card.repairType] : "",
            jobType: card.jobType,
            dateIn: formatDate(card.dateIn),
            dateOut: formatDate(card.dateOut),
            status: card.status === "OPEN" ? "Open" : "Closed",
            hours: Math.round(e.hours * 100) / 100,
            labour: round3(e.labour),
            parts: round3(e.parts),
            total: round3(e.labour + e.parts),
          };
        }),
      );
      return { data, fileName: `job-card-costs_${suffix}.xlsx` };
    }

    const perAsset = new Map<string, { asset: (typeof cards)[number]["asset"]; cards: number; hours: number; labour: number; parts: number }>();
    for (const card of cards) {
      if (!card.asset) continue;
      const e = perCard.get(card.id)!;
      const a = perAsset.get(card.asset.id) ?? { asset: card.asset, cards: 0, hours: 0, labour: 0, parts: 0 };
      a.cards += 1;
      a.hours += e.hours;
      a.labour += e.labour;
      a.parts += e.parts;
      perAsset.set(card.asset.id, a);
    }
    const rows = Array.from(perAsset.values()).sort((a, b) => b.labour + b.parts - (a.labour + a.parts));
    const data = await buildSheet(
      "Asset costs",
      [
        { header: "Asset", key: "code", width: 12 },
        { header: "Description", key: "description", width: 30 },
        { header: "Category", key: "category", width: 14 },
        { header: "Plate No.", key: "plate", width: 12 },
        { header: "Job Cards", key: "cards", width: 10 },
        { header: "Hours", key: "hours", width: 9 },
        { header: "Labour (KWD)", key: "labour", width: 13 },
        { header: "Parts (KWD)", key: "parts", width: 12 },
        { header: "Total (KWD)", key: "total", width: 12 },
        { header: "Purchase Value (KWD)", key: "purchase", width: 16 },
        { header: "Book Value Today (KWD)", key: "book", width: 18 },
      ],
      rows.map(({ asset, cards: count, hours, labour, parts }) => {
        const book = asset ? bookValue(asset) : null;
        return {
          code: asset?.code ?? "",
          description: asset?.description ?? "",
          category: asset?.category ?? "",
          plate: asset?.plateNo ?? "",
          cards: count,
          hours: Math.round(hours * 100) / 100,
          labour: round3(labour),
          parts: round3(parts),
          total: round3(labour + parts),
          purchase: asset?.purchaseValue === null || !asset ? "" : Number(asset.purchaseValue),
          book: book === null ? "" : round3(book),
        };
      }),
    );
    return { data, fileName: `asset-costs_${suffix}.xlsx` };
  }

  if (kind === "team-hours") {
    // Supervisors without "View all employees' records": their team and themselves.
    const scope = seesAllRecords(user) ? undefined : Array.from(new Set([...user.supervisedEmployeeIds, ...(user.employeeId ? [user.employeeId] : [])]));
    const { records } = await periodActivity(range, scope);
    const cardCodes = new Map(
      (await prisma.jobCard.findMany({ where: { id: { in: [...new Set(records.map((r) => r.jobCardId))] } }, select: { id: true, code: true, asset: { select: { code: true } } } })).map(
        (c) => [c.id, c],
      ),
    );
    const grouped = new Map<string, { fileNo: string; name: string; cards: Map<string, number> }>();
    for (const r of records) {
      const g = grouped.get(r.employeeId) ?? { fileNo: r.employee.fileNo, name: r.employee.name, cards: new Map<string, number>() };
      g.cards.set(r.jobCardId, (g.cards.get(r.jobCardId) ?? 0) + Number(r.hours));
      grouped.set(r.employeeId, g);
    }
    const rows: Record<string, unknown>[] = [];
    for (const g of Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name))) {
      let total = 0;
      for (const [cardId, hours] of g.cards) {
        total += hours;
        const card = cardCodes.get(cardId);
        rows.push({ fileNo: g.fileNo, name: g.name, card: card?.code ?? "", asset: card?.asset?.code ?? "", hours: Math.round(hours * 100) / 100 });
      }
      rows.push({ fileNo: g.fileNo, name: `${g.name} – TOTAL`, card: "", asset: "", hours: Math.round(total * 100) / 100 });
    }
    const data = await buildSheet(
      "Hours",
      [
        { header: "File No.", key: "fileNo", width: 12 },
        { header: "Employee", key: "name", width: 32 },
        { header: "Job Card", key: "card", width: 16 },
        { header: "Asset", key: "asset", width: 12 },
        { header: "Hours", key: "hours", width: 10 },
      ],
      rows,
    );
    return { data, fileName: `team-hours_${suffix}.xlsx` };
  }

  const { movements } = await periodActivity(range);
  const data = await buildSheet(
    "Parts issued",
    [
      { header: "Date", key: "date", width: 17 },
      { header: "Job Card", key: "card", width: 16 },
      { header: "Asset", key: "asset", width: 12 },
      { header: "Part No.", key: "partNo", width: 16 },
      { header: "Part Name", key: "name", width: 30 },
      { header: "Qty", key: "qty", width: 8 },
      { header: "Unit", key: "unit", width: 8 },
      { header: "Unit Cost (KWD)", key: "unitCost", width: 14 },
      { header: "Value (KWD)", key: "value", width: 12 },
      { header: "Kind", key: "kind", width: 10 },
      { header: "Note", key: "note", width: 30 },
      { header: "By", key: "by", width: 20 },
    ],
    movements.map((m) => ({
      date: new Date(m.createdAt.getTime() + 3 * 3600_000).toISOString().slice(0, 16).replace("T", " "),
      card: m.jobCard?.code ?? "",
      asset: m.jobCard?.asset?.code ?? "",
      partNo: m.part.partNo,
      name: m.part.name,
      qty: -Number(m.qty),
      unit: m.part.unit,
      unitCost: Number(m.unitCost),
      value: round3(-Number(m.qty) * Number(m.unitCost)),
      kind: m.kind === "ISSUE" ? "Issued" : "Returned",
      note: m.note,
      by: m.user?.name ?? "",
    })),
  );
  return { data, fileName: `parts-issued_${suffix}.xlsx` };
}
