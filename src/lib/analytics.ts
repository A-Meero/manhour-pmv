import "server-only";

import { prisma } from "@/lib/prisma";
import { monthKey, spreadHours, toIsoDate, weekStart } from "@/lib/dates";
import type { EmployeeScope } from "@/lib/auth/access";
import { scopeWhere } from "@/lib/auth/access";

export type AnalyticsFilter = { from: Date; to: Date; employeeId?: string; jobCardCode?: string };

export type AnalyticsResult = {
  totals: { hours: number; records: number; employees: number; jobCards: number; avgPerEmployee: number };
  byMonth: { key: string; hours: number }[];
  byWeek: { key: string; hours: number }[];
  byEmployee: { id: string; fileNo: string; name: string; hours: number; records: number; jobCards: number }[];
  byJobCard: { code: string; hours: number; records: number; employees: number }[];
  employeeMonths: { months: string[]; rows: { id: string; fileNo: string; name: string; values: number[]; total: number }[] };
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Hours are spread evenly across each record's days and only the days inside the selected range are counted,
 * so a record that crosses a month or week boundary is split between them.
 */
export async function getAnalytics(filter: AnalyticsFilter, scope: EmployeeScope, weekStartDay: number): Promise<AnalyticsResult> {
  const records = await prisma.manHourRecord.findMany({
    where: {
      ...scopeWhere(scope),
      startDate: { lte: filter.to },
      endDate: { gte: filter.from },
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.jobCardCode ? { jobCard: { code: filter.jobCardCode } } : {}),
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      hours: true,
      employee: { select: { fileNo: true, name: true } },
      jobCard: { select: { code: true } },
    },
  });

  const months = new Map<string, number>();
  const weeks = new Map<string, number>();
  const employees = new Map<string, AnalyticsResult["byEmployee"][number] & { cards: Set<string> }>();
  const cards = new Map<string, { code: string; hours: number; records: number; people: Set<string> }>();
  const employeeMonth = new Map<string, Map<string, number>>();
  let total = 0;

  const fromKey = toIsoDate(filter.from);
  const toKey = toIsoDate(filter.to);

  for (const record of records) {
    let inRange = 0;
    for (const { day, hours } of spreadHours(record.startDate, record.endDate, Number(record.hours))) {
      const key = toIsoDate(day);
      if (key < fromKey || key > toKey) continue;
      inRange += hours;
      const month = monthKey(day);
      months.set(month, (months.get(month) ?? 0) + hours);
      const week = toIsoDate(weekStart(day, weekStartDay));
      weeks.set(week, (weeks.get(week) ?? 0) + hours);
      const perEmployee = employeeMonth.get(record.employeeId) ?? new Map<string, number>();
      perEmployee.set(month, (perEmployee.get(month) ?? 0) + hours);
      employeeMonth.set(record.employeeId, perEmployee);
    }
    total += inRange;

    const employee = employees.get(record.employeeId) ?? {
      id: record.employeeId,
      fileNo: record.employee.fileNo,
      name: record.employee.name,
      hours: 0,
      records: 0,
      jobCards: 0,
      cards: new Set<string>(),
    };
    employee.hours += inRange;
    employee.records += 1;
    employee.cards.add(record.jobCard.code);
    employees.set(record.employeeId, employee);

    const card = cards.get(record.jobCard.code) ?? { code: record.jobCard.code, hours: 0, records: 0, people: new Set<string>() };
    card.hours += inRange;
    card.records += 1;
    card.people.add(record.employeeId);
    cards.set(record.jobCard.code, card);
  }

  // Fill in empty months/weeks so charts show gaps.
  const monthKeys: string[] = [];
  for (let d = new Date(Date.UTC(filter.from.getUTCFullYear(), filter.from.getUTCMonth(), 1)); d <= filter.to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    monthKeys.push(monthKey(d));
  }
  const weekKeys: string[] = [];
  for (let d = weekStart(filter.from, weekStartDay); d <= filter.to; d = new Date(d.getTime() + 7 * 86400000)) {
    weekKeys.push(toIsoDate(d));
  }

  const byEmployee = Array.from(employees.values())
    .map(({ cards: set, ...rest }) => ({ ...rest, hours: round(rest.hours), jobCards: set.size }))
    .sort((a, b) => b.hours - a.hours);

  return {
    totals: {
      hours: round(total),
      records: records.length,
      employees: employees.size,
      jobCards: cards.size,
      avgPerEmployee: employees.size ? round(total / employees.size) : 0,
    },
    byMonth: monthKeys.map((key) => ({ key, hours: round(months.get(key) ?? 0) })),
    byWeek: weekKeys.map((key) => ({ key, hours: round(weeks.get(key) ?? 0) })),
    byEmployee,
    byJobCard: Array.from(cards.values())
      .map((card) => ({ code: card.code, hours: round(card.hours), records: card.records, employees: card.people.size }))
      .sort((a, b) => b.hours - a.hours),
    employeeMonths: {
      months: monthKeys,
      rows: byEmployee.map((employee) => {
        const values = monthKeys.map((month) => round(employeeMonth.get(employee.id)?.get(month) ?? 0));
        return { id: employee.id, fileNo: employee.fileNo, name: employee.name, values, total: employee.hours };
      }),
    },
  };
}
