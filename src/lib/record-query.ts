import "server-only";

import type { DataSource, Prisma } from "@prisma/client";
import { parseDate } from "@/lib/dates";
import type { EmployeeScope } from "@/lib/auth/access";
import { scopeWhere } from "@/lib/auth/access";

export type RecordFilters = {
  q: string;
  employeeId: string;
  jobCard: string;
  from: string;
  to: string;
  source: string;
  page: number;
};

const SOURCES: DataSource[] = ["MANUAL", "EXCEL", "API", "PHOTO", "QR"];

export function readFilters(params: Record<string, string | string[] | undefined> | URLSearchParams): RecordFilters {
  const get = (key: string) => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  return {
    q: get("q"),
    employeeId: get("employeeId"),
    jobCard: get("jobCard"),
    from: get("from"),
    to: get("to"),
    source: get("source"),
    page: Math.max(1, Number(get("page")) || 1),
  };
}

/**
 * Records overlapping the from/to range, restricted to the user's scope.
 * searchPeople = false (normal employees: not admin/manager, supervising nobody): the text search only looks at
 * job cards and remarks, never names or file numbers, and the employee filter is ignored.
 */
export function buildRecordWhere(filters: RecordFilters, scope: EmployeeScope, searchPeople = true): Prisma.ManHourRecordWhereInput {
  const and: Prisma.ManHourRecordWhereInput[] = [scopeWhere(scope)];
  if (filters.employeeId && searchPeople) and.push({ employeeId: filters.employeeId });
  if (filters.jobCard) and.push({ jobCard: { code: { contains: filters.jobCard, mode: "insensitive" } } });
  const from = parseDate(filters.from);
  const to = parseDate(filters.to);
  if (from) and.push({ endDate: { gte: from } });
  if (to) and.push({ startDate: { lte: to } });
  if (SOURCES.includes(filters.source as DataSource)) and.push({ source: filters.source as DataSource });
  if (filters.q) {
    and.push({
      OR: [
        ...(searchPeople
          ? [
              { employee: { name: { contains: filters.q, mode: "insensitive" as const } } },
              { employee: { fileNo: { contains: filters.q, mode: "insensitive" as const } } },
            ]
          : []),
        { jobCard: { code: { contains: filters.q, mode: "insensitive" } } },
        { remarks: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
}

export const recordInclude = {
  employee: { select: { id: true, fileNo: true, name: true, jobTitle: true, hourlyRate: true } },
  jobCard: { select: { code: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.ManHourRecordInclude;
