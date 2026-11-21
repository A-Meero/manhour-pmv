import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canReviewSessions, methodAllowed, reviewsAllSessions } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { autoStopStale, reviewScopeWhere } from "@/lib/work-sessions";
import { sessionInclude, toSessionRows } from "@/lib/job-card-view";
import { normalizeCode } from "@/lib/masterdata";
import { addDays, parseDate, startOfLocalDay } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { SessionsTable } from "@/components/sessions-table";

export const dynamic = "force-dynamic";

/** Supervisors, managers and admins check QR sessions: flagged ones (auto-stopped, over a limit) and running ones. */
export default async function SessionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage(canReviewSessions);
  const { methods } = await getSettings();
  const params = await searchParams;
  const show = params.show ?? "review";
  const employeeId = params.employeeId ?? "";
  const jobCard = normalizeCode(params.jobCard);
  const from = parseDate(params.from);
  const to = parseDate(params.to);

  const scope = reviewScopeWhere(user);
  await autoStopStale(scope);

  const where: Prisma.WorkSessionWhereInput = {
    ...scope,
    ...(show === "review" ? { OR: [{ needsReview: true }, { endedAt: null }] } : show === "running" ? { endedAt: null } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(jobCard ? { jobCard: { code: { contains: jobCard } } } : {}),
    ...(from || to
      ? { startedAt: { ...(from ? { gte: startOfLocalDay(from) } : {}), ...(to ? { lt: startOfLocalDay(addDays(to, 1)) } : {}) } }
      : {}),
  };
  const [sessions, employees, counts] = await Promise.all([
    prisma.workSession.findMany({ where, include: sessionInclude, orderBy: [{ needsReview: "desc" }, { startedAt: "desc" }], take: 500 }),
    prisma.employee.findMany({
      where: reviewsAllSessions(user) ? { workSessions: { some: {} } } : { id: { in: user.supervisedEmployeeIds } },
      select: { id: true, fileNo: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.workSession.groupBy({ by: ["needsReview"], where: { ...scope, needsReview: true }, _count: true }),
  ]);
  const flagged = counts.reduce((sum, row) => sum + row._count, 0);

  return (
    <>
      <PageHeader
        title="Work sessions"
        description={`QR start/stop sessions${reviewsAllSessions(user) ? "" : " of the employees you supervise"}. Correct the times of auto-stopped sessions; the man-hour records update by themselves.${flagged ? ` ${flagged} session(s) need review.` : ""}`}
      />
      {!methodAllowed(user, methods, "qr") && <p className="mb-3 text-sm text-amber-700">Job card QR time tracking is switched off.</p>}
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6" action="/sessions">
        <select name="show" defaultValue={show} className="input">
          <option value="review">Needs review + running</option>
          <option value="running">Running now</option>
          <option value="all">All sessions</option>
        </select>
        <select name="employeeId" defaultValue={employeeId} className="input">
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.fileNo} – {employee.name}</option>
          ))}
        </select>
        <input name="jobCard" defaultValue={params.jobCard ?? ""} placeholder="Job card" className="input" />
        <input name="from" type="date" defaultValue={params.from ?? ""} className="input" aria-label="From" />
        <input name="to" type="date" defaultValue={params.to ?? ""} className="input" aria-label="To" />
        <button className="btn">Filter</button>
      </form>
      <SessionsTable sessions={toSessionRows(user, sessions)} emptyText={show === "review" ? "Nothing to review." : "No sessions found."} />
      {sessions.length === 500 && <p className="mt-2 text-xs text-gray-500">Showing the first 500. Narrow the filters to see more.</p>}
    </>
  );
}
