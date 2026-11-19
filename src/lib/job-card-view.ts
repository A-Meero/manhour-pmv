import "server-only";

import { prisma } from "@/lib/prisma";
import { getJobCardCost } from "@/lib/job-card-cost";
import { formatDateTime, localDay, toIsoDate } from "@/lib/dates";
import { canFixSessionsOf, sessionHours } from "@/lib/work-sessions";
import type { CurrentUser } from "@/lib/auth/session";
import type { IssuedLine } from "@/components/issue-parts-panel";
import type { SessionRow } from "@/components/sessions-table";

/** Data shared by the QR page (/jc/CODE) and the job card details page. */

export async function issuedLines(jobCardId: string, cost?: Awaited<ReturnType<typeof getJobCardCost>>): Promise<IssuedLine[]> {
  const { parts } = cost ?? (await getJobCardCost(jobCardId));
  return parts.map((line) => ({
    id: line.id,
    kind: line.kind as IssuedLine["kind"],
    partNo: line.part.partNo,
    name: line.part.name,
    unit: line.part.unit,
    qty: line.qty,
    unitCost: line.unitCost,
    cost: line.cost,
    by: line.user?.name ?? "",
    at: formatDateTime(line.createdAt),
    note: line.note,
    reversed: !!line.reversal,
  }));
}

type SessionWithNames = {
  id: string;
  employeeId: string;
  jobCardId: string;
  startedAt: Date;
  endedAt: Date | null;
  autoStopped: boolean;
  needsReview: boolean;
  reviewNote: string;
  employee: { fileNo: string; name: string };
  jobCard: { code: string };
  editedBy: { name: string } | null;
};

export const sessionInclude = {
  employee: { select: { fileNo: true, name: true } },
  jobCard: { select: { code: true } },
  editedBy: { select: { name: true } },
} as const;

export function toSessionRows(user: CurrentUser, sessions: SessionWithNames[]): SessionRow[] {
  return sessions.map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    employee: `${s.employee.fileNo} – ${s.employee.name}`,
    jobCardId: s.jobCardId,
    jobCard: s.jobCard.code,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    hours: Math.round(sessionHours(s.startedAt, s.endedAt) * 100) / 100,
    autoStopped: s.autoStopped,
    needsReview: s.needsReview,
    reviewNote: s.reviewNote,
    editedBy: s.editedBy?.name ?? "",
    canFix: canFixSessionsOf(user, s.employeeId),
  }));
}

/** A technician's own time on one card: finished hours today and in total, the running session. */
export async function myTimeOnCard(employeeId: string, jobCardId: string) {
  const sessions = await prisma.workSession.findMany({ where: { employeeId, jobCardId }, orderBy: { startedAt: "desc" } });
  const today = toIsoDate(localDay(new Date()));
  let hoursToday = 0;
  let hoursTotal = 0;
  for (const s of sessions) {
    if (!s.endedAt) continue;
    const hours = sessionHours(s.startedAt, s.endedAt);
    hoursTotal += hours;
    if (toIsoDate(localDay(s.startedAt)) === today) hoursToday += hours;
  }
  return {
    sessions,
    running: sessions.find((s) => !s.endedAt) ?? null,
    hoursToday: Math.round(hoursToday * 100) / 100,
    hoursTotal: Math.round(hoursTotal * 100) / 100,
  };
}
