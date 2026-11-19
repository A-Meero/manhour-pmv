import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { canScanTime } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { autoStopStale, sessionHours } from "@/lib/work-sessions";
import { addDays, formatDateTime, formatTime } from "@/lib/dates";
import { Alert, PageHeader } from "@/components/ui";

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** A technician's own QR work: what is running now and the last 30 days of sessions. */
export default async function MyWorkPage() {
  const user = await requireUser();
  const settings = await getSettings();
  if (!canScanTime(user, settings.methods) || !user.employeeId) redirect("/unauthorized");
  await autoStopStale({ employeeId: user.employeeId });

  const sessions = await prisma.workSession.findMany({
    where: { employeeId: user.employeeId, OR: [{ endedAt: null }, { startedAt: { gte: addDays(new Date(), -30) } }] },
    include: { jobCard: { select: { id: true, code: true, status: true } } },
    orderBy: { startedAt: "desc" },
    take: 300,
  });
  const running = sessions.find((s) => !s.endedAt);
  const byCard = new Map<string, { code: string; status: string; hours: number; sessions: number }>();
  for (const s of sessions) {
    if (!s.endedAt) continue;
    const entry = byCard.get(s.jobCardId) ?? { code: s.jobCard.code, status: s.jobCard.status, hours: 0, sessions: 0 };
    entry.hours += sessionHours(s.startedAt, s.endedAt);
    entry.sessions += 1;
    byCard.set(s.jobCardId, entry);
  }

  return (
    <>
      <PageHeader title="My work" description="Scan a job card's QR code with your phone camera to start or stop work on it." />
      <div className="space-y-5">
        {running ? (
          <div className="card flex flex-col gap-3 border-green-300 bg-green-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              You are working on <span className="font-mono font-bold">{running.jobCard.code}</span> since {formatTime(running.startedAt)} (
              {fmt(sessionHours(running.startedAt, null))}h so far).
            </p>
            <Link href={`/jc/${encodeURIComponent(running.jobCard.code)}`} className="btn btn-primary">Open to stop</Link>
          </div>
        ) : (
          <Alert kind="info">You are not working on a job card right now.</Alert>
        )}

        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Last 30 days by job card</h2>
          {byCard.size === 0 ? (
            <p className="text-sm text-gray-500">No finished sessions yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Job card</th>
                    <th>Status</th>
                    <th className="text-right">Sessions</th>
                    <th className="text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(byCard.values()).map((card) => (
                    <tr key={card.code}>
                      <td className="font-mono font-semibold">
                        <Link className="text-brand hover:underline" href={`/jc/${encodeURIComponent(card.code)}`}>{card.code}</Link>
                      </td>
                      <td>{card.status === "CLOSED" ? "Closed" : "Open"}</td>
                      <td className="text-right">{card.sessions}</td>
                      <td className="text-right font-semibold">{fmt(card.hours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Sessions</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-mono font-semibold">{s.jobCard.code}</span> · {formatDateTime(s.startedAt)} →{" "}
                  {s.endedAt ? formatTime(s.endedAt) : <span className="font-medium text-green-700">running</span>}
                  {s.autoStopped && <span className="badge ml-2 bg-amber-100 text-amber-800">Auto-stopped</span>}
                  {s.needsReview && <span className="badge ml-2 bg-amber-100 text-amber-800">Under review</span>}
                </span>
                <span className="shrink-0 font-semibold">{s.endedAt ? `${fmt(sessionHours(s.startedAt, s.endedAt))}h` : ""}</span>
              </li>
            ))}
            {sessions.length === 0 && <li className="py-2 text-gray-500">No sessions in the last 30 days.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
