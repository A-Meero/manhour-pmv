import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { canBrowseJobCards, canManageInventory, canScanTime, isAdmin } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { normalizeCode } from "@/lib/masterdata";
import { autoStopStale, pendingAfterShift, sessionHours, startBlocker } from "@/lib/work-sessions";
import { canCloseCard } from "@/lib/job-cards";
import { issuedLines, myTimeOnCard } from "@/lib/job-card-view";
import { formatDateTime, formatTime } from "@/lib/dates";
import { CookieBounce } from "@/components/cookie-bounce";
import { WorkPanel } from "@/components/work-panel";
import { IssuePartsPanel } from "@/components/issue-parts-panel";
import { JobCardStatusButton } from "@/components/job-card-status-button";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

function Shell({ children, userName }: { children: React.ReactNode; userName?: string }) {
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-4">
      <header className="mb-4 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/ahmadiah-a.png" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="text-sm font-semibold text-gray-700">Man Hour System</span>
        </Link>
        {userName && <span className="truncate text-xs text-gray-500">{userName}</span>}
      </header>
      {children}
    </main>
  );
}

/** Opened by scanning a job card's QR code with the phone camera. */
export default async function JobCardScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ b?: string }>;
}) {
  const [{ code: rawCode }, { b }] = await Promise.all([params, searchParams]);
  const code = normalizeCode(decodeURIComponent(rawCode));
  const user = await getCurrentUser();
  if (!user) {
    if (b !== "1") return <CookieBounce />;
    redirect(`/login?next=${encodeURIComponent(`/jc/${code}`)}`);
  }

  const card = await prisma.jobCard.findUnique({ where: { code }, include: { asset: { select: { code: true, description: true } } } });
  if (!card) {
    return (
      <Shell userName={user.name}>
        <Alert>Job card {code} was not found. Check the label or ask the office.</Alert>
      </Shell>
    );
  }
  await autoStopStale({ jobCardId: card.id });
  if (user.employeeId) await autoStopStale({ employeeId: user.employeeId });

  const settings = await getSettings();
  const isTechnician = canScanTime(user, settings.methods);
  const isStore = canManageInventory(user);
  const browse = canBrowseJobCards(user);
  const [mine, blocker, otherOpen, mayClose, lines, team, pending] = await Promise.all([
    isTechnician && user.employeeId ? myTimeOnCard(user.employeeId, card.id) : Promise.resolve(null),
    isTechnician ? startBlocker(user, card) : Promise.resolve(""),
    isTechnician && user.employeeId
      ? prisma.workSession.findFirst({
          where: { employeeId: user.employeeId, endedAt: null, jobCardId: { not: card.id } },
          include: { jobCard: { select: { code: true } } },
        })
      : Promise.resolve(null),
    canCloseCard(user, card.id),
    isStore ? issuedLines(card.id) : Promise.resolve([]),
    prisma.workSession.findMany({
      where: { jobCardId: card.id, endedAt: null },
      include: { employee: { select: { name: true } } },
      orderBy: { startedAt: "asc" },
    }),
    isTechnician && user.employeeId ? pendingAfterShift(user.employeeId, card.id) : Promise.resolve(null),
  ]);
  const afterShift = pending
    ? {
        kind: pending.endedAt ? ("limit" as const) : ("running" as const),
        shiftEnd: pending.shiftEndAt ? formatTime(pending.shiftEndAt) : "",
        stoppedAt: pending.endedAt ? formatDateTime(pending.endedAt) : "",
      }
    : null;
  const closed = card.status === "CLOSED";
  const qrSwitchedOff = !!user.employeeId && !isTechnician;
  const nothingToDo = !isTechnician && !isStore && !mayClose && !browse;

  return (
    <Shell userName={user.name}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Job card</p>
          <h1 className="font-mono text-2xl font-bold">{card.code}</h1>
          {card.asset && (
            <p className="text-sm text-gray-600">
              <span className="font-mono font-semibold">{card.asset.code}</span> {card.asset.description}
            </p>
          )}
        </div>
        {closed ? <span className="badge bg-gray-800 text-white">Closed</span> : <span className="badge bg-blue-100 text-blue-800">Open</span>}
      </div>

      <div className="space-y-4">
        {closed && <Alert kind="info">This job card was closed{card.closedAt ? ` on ${formatDateTime(card.closedAt)}` : ""}.</Alert>}
        {qrSwitchedOff && <Alert kind="info">Recording time by QR code is switched off by the administrator.</Alert>}

        {isTechnician && mine && (
          <>
            <WorkPanel
              jobCardId={card.id}
              code={card.code}
              runningSince={mine.running?.startedAt.toISOString() ?? null}
              otherRunning={otherOpen?.jobCard.code ?? null}
              blocker={blocker}
              hoursToday={mine.hoursToday}
              hoursTotal={mine.hoursTotal}
              afterShift={afterShift}
            />
            {mine.sessions.length > 0 && (
              <div className="card p-4">
                <h2 className="mb-2 font-semibold">My sessions on this card</h2>
                <ul className="divide-y divide-gray-100 text-sm">
                  {mine.sessions.slice(0, 20).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        {formatDateTime(s.startedAt)} → {s.endedAt ? formatTime(s.endedAt) : <span className="font-medium text-green-700">running</span>}
                        {s.needsReview && <span className="badge ml-2 bg-amber-100 text-amber-800">Under review</span>}
                      </span>
                      <span className="font-semibold">{s.endedAt ? `${fmt(sessionHours(s.startedAt, s.endedAt))}h` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {!user.employeeId && !isStore && (
          <Alert kind="info">Your login is not linked to an employee record, so you can&apos;t record time here.</Alert>
        )}

        {isStore && <IssuePartsPanel jobCardId={card.id} closed={closed && !isAdmin(user)} issued={lines} canIssue />}

        {(mayClose || browse) && (
          <div className="card space-y-3 p-4">
            <h2 className="font-semibold">Working now</h2>
            {team.length === 0 ? (
              <p className="text-sm text-gray-500">Nobody is working on this card right now.</p>
            ) : (
              <ul className="text-sm">
                {team.map((s) => (
                  <li key={s.id}>
                    {s.employee.name} <span className="text-gray-500">since {formatTime(s.startedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {browse && <Link href={`/job-cards/${card.id}`} className="btn">Job card details</Link>}
              {mayClose && <JobCardStatusButton jobCardId={card.id} code={card.code} status={card.status} />}
            </div>
          </div>
        )}

        {nothingToDo && <Alert kind="info">There is nothing for you to do on this job card.</Alert>}
      </div>
    </Shell>
  );
}
