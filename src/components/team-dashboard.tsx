import Link from "next/link";
import { ClipboardList, FileWarning, Timer, UserCheck, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { addDays, formatTime, todayUtc, weekStart } from "@/lib/dates";
import { sessionHours } from "@/lib/work-sessions";
import { REPAIR_TYPE_LABEL } from "@/lib/repair-type";

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Home page, for team members: open job cards assigned to me by my team leader. */
export async function AssignedToMe({ user }: { user: CurrentUser }) {
  if (!user.employeeId) return null;
  const cards = await prisma.jobCard.findMany({
    where: { status: "OPEN", active: true, assignments: { some: { employeeId: user.employeeId } } },
    include: { asset: { select: { code: true, description: true } }, receivedByEmployee: { select: { name: true } } },
    orderBy: [{ dateIn: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  if (!cards.length) return null;
  return (
    <div className="card mb-5 p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <UserCheck className="h-4 w-4" /> Assigned to me
      </h2>
      <ul className="divide-y divide-gray-100 text-sm">
        {cards.map((card) => (
          <li key={card.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <Link href={`/jc/${encodeURIComponent(card.code)}`} className="min-w-0">
              <b className="font-mono text-brand">{card.code}</b>
              {card.asset && <span className="text-gray-700"> · {card.asset.code} {card.asset.description}</span>}
              {card.repairType && <span className="text-gray-500"> · {REPAIR_TYPE_LABEL[card.repairType]}</span>}
            </Link>
            {card.receivedByEmployee && <span className="text-xs text-gray-500">from {card.receivedByEmployee.name}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Home page, for team leaders (users who supervise employees): their open job cards (received by them or their team
 * leaders) with assignments and flags, who is working now, and hours this week per team member.
 */
export async function TeamDashboard({ user, weekStartDay }: { user: CurrentUser; weekStartDay: number }) {
  const team = user.supervisedEmployeeIds;
  if (!team.length) return null;
  const leaders = Array.from(new Set([...(user.employeeId ? [user.employeeId] : []), ...team]));
  const wk = weekStart(todayUtc(), weekStartDay);

  const [cards, working, weekHours, members] = await Promise.all([
    prisma.jobCard.findMany({
      where: { status: "OPEN", active: true, receivedById: { in: leaders } },
      include: {
        asset: { select: { code: true, description: true } },
        assignments: { select: { employee: { select: { name: true } } } },
        partRequests: { where: { status: { not: "FULFILLED" } }, select: { id: true } },
      },
      orderBy: [{ dateIn: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.workSession.findMany({
      where: { employeeId: { in: team }, endedAt: null },
      include: { employee: { select: { name: true } }, jobCard: { select: { code: true } } },
      orderBy: { startedAt: "asc" },
    }),
    prisma.manHourRecord.groupBy({
      by: ["employeeId"],
      where: { employeeId: { in: team }, startDate: { gte: wk, lte: addDays(wk, 6) } },
      _sum: { hours: true },
    }),
    prisma.employee.findMany({ where: { id: { in: team }, active: true }, select: { id: true, fileNo: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const hoursOnCards = cards.length
    ? await prisma.manHourRecord.groupBy({ by: ["jobCardId"], where: { jobCardId: { in: cards.map((c) => c.id) } }, _sum: { hours: true } })
    : [];
  const cardHours = new Map(hoursOnCards.map((row) => [row.jobCardId, Number(row._sum.hours ?? 0)]));
  const memberHours = new Map(weekHours.map((row) => [row.employeeId, Number(row._sum.hours ?? 0)]));
  const openRequests = cards.reduce((sum, card) => sum + card.partRequests.length, 0);

  return (
    <div className="mb-5 space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Users className="h-5 w-5" /> My team
      </h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Open job cards ({cards.length})</h3>
            {openRequests > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-800">
                <ClipboardList className="h-3.5 w-3.5" /> {openRequests} open part request{openRequests > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {cards.length === 0 ? (
            <p className="text-sm text-gray-500">No open job cards received by you or your team.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job card</th>
                    <th>Asset</th>
                    <th>Assigned to</th>
                    <th className="text-right">Hours</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cards.map((card) => (
                    <tr key={card.id}>
                      <td className="font-mono">
                        <Link href={`/job-cards/${card.id}`} className="font-semibold text-brand hover:underline">{card.code}</Link>
                        {card.repairType && <span className="block font-sans text-xs text-gray-500">{REPAIR_TYPE_LABEL[card.repairType]}</span>}
                      </td>
                      <td>{card.asset ? <><span className="font-mono">{card.asset.code}</span> {card.asset.description}</> : ""}</td>
                      <td>{card.assignments.length ? card.assignments.map((a) => a.employee.name).join(", ") : <span className="text-amber-700">Not assigned</span>}</td>
                      <td className="text-right">{fmt(cardHours.get(card.id) ?? 0)}</td>
                      <td className="whitespace-nowrap text-xs">
                        {card.documentRequired && !card.photoPath && (
                          <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-amber-300 px-2 font-bold uppercase text-amber-950">
                            <FileWarning className="h-3 w-3" /> Document
                          </span>
                        )}
                        {card.partRequests.length > 0 && <span className="rounded-full bg-amber-100 px-2 text-amber-800">{card.partRequests.length} request</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="mb-2 flex items-center gap-2 font-semibold">
              <Timer className="h-4 w-4" /> Working now ({working.length})
            </h3>
            {working.length === 0 ? (
              <p className="text-sm text-gray-500">Nobody in your team is clocked in.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {working.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span>
                      {s.employee.name} · <span className="font-mono">{s.jobCard.code}</span>
                    </span>
                    <span className="text-gray-500">
                      since {formatTime(s.startedAt)} ({fmt(sessionHours(s.startedAt, null))}h)
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <h3 className="mb-2 font-semibold">Hours this week</h3>
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>{m.name}</span>
                  <span className="font-semibold">{fmt(memberHours.get(m.id) ?? 0)}</span>
                </li>
              ))}
            </ul>
            <Link href="/records" className="mt-2 block text-xs text-brand hover:underline">Team records →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
