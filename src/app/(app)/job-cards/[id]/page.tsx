import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Printer, QrCode } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import {
  canBrowseJobCards,
  canManageInventory,
  canViewCosts,
  getViewScope,
  isManagerOrAdmin,
  scopeWhere,
} from "@/lib/auth/access";
import { autoStopStale } from "@/lib/work-sessions";
import { canCloseCard } from "@/lib/job-cards";
import { getJobCardCost } from "@/lib/job-card-cost";
import { issuedLines, sessionInclude, toSessionRows } from "@/lib/job-card-view";
import { appOrigin, jobCardLink, qrDataUrl } from "@/lib/qr";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, SOURCE_LABEL } from "@/components/ui";
import { JobCardStatusButton } from "@/components/job-card-status-button";
import { AddSessionButton, SessionsTable } from "@/components/sessions-table";
import { IssuePartsPanel } from "@/components/issue-parts-panel";

export const dynamic = "force-dynamic";

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export default async function JobCardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage(canBrowseJobCards);
  const { id } = await params;
  const card = await prisma.jobCard.findUnique({ where: { id }, include: { closedBy: { select: { name: true } } } });
  if (!card) notFound();
  await autoStopStale({ jobCardId: card.id });

  // Admins/managers see everyone; supervisors their employees; a store manager only the parts.
  const seesPeople = isManagerOrAdmin(user) || user.supervisedEmployeeIds.length > 0;
  const peopleWhere = scopeWhere(getViewScope(user));
  const showCosts = canViewCosts(user);
  const isStore = canManageInventory(user);

  const [sessions, records, cost, mayClose, origin, employees] = await Promise.all([
    seesPeople
      ? prisma.workSession.findMany({ where: { jobCardId: card.id, ...peopleWhere }, include: sessionInclude, orderBy: { startedAt: "desc" }, take: 500 })
      : Promise.resolve([]),
    seesPeople
      ? prisma.manHourRecord.findMany({
          where: { jobCardId: card.id, ...peopleWhere },
          include: { employee: { select: { fileNo: true, name: true, hourlyRate: true } } },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
    showCosts || isStore ? getJobCardCost(card.id) : Promise.resolve(null),
    canCloseCard(user, card.id),
    appOrigin(),
    seesPeople
      ? prisma.employee.findMany({
          where: { active: true, ...(isManagerOrAdmin(user) ? {} : { id: { in: user.supervisedEmployeeIds } }) },
          select: { id: true, fileNo: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  const link = jobCardLink(origin, card.code);
  const qr = await qrDataUrl(link, 240);
  const lines = cost ? await issuedLines(card.id, cost) : [];
  const labourByRecord = new Map((cost?.labour ?? []).map((line) => [line.id, line]));
  const open = sessions.filter((s) => !s.endedAt).length;
  const flagged = sessions.filter((s) => s.needsReview).length;

  return (
    <>
      <PageHeader
        title={`Job card ${card.code}`}
        description={
          card.status === "CLOSED"
            ? `Closed${card.closedAt ? ` on ${formatDateTime(card.closedAt)}` : ""}${card.closedBy ? ` by ${card.closedBy.name}` : ""}.`
            : "Open: technicians can scan its QR code to record time."
        }
        actions={
          <>
            <Link href="/job-cards" className="btn">All job cards</Link>
            {mayClose && <JobCardStatusButton jobCardId={card.id} code={card.code} status={card.status} />}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card flex flex-col items-center gap-3 p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR code for ${card.code}`} width={200} height={200} />
          <p className="break-all text-xs text-gray-500">{link}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <a className="btn btn-sm" href={`/api/templates/qr-labels?ids=${card.id}`} target="_blank">
              <Printer className="h-3.5 w-3.5" /> Print label
            </a>
            <a className="btn btn-sm" href={`/api/job-cards/${card.id}/qr?download=1`}>
              <Download className="h-3.5 w-3.5" /> PNG
            </a>
            <Link className="btn btn-sm" href={`/jc/${encodeURIComponent(card.code)}`}>
              <QrCode className="h-3.5 w-3.5" /> Scan page
            </Link>
          </div>
          {!card.active && <p className="text-xs font-medium text-red-700">This job card is inactive.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-3">
          {[
            ...(seesPeople
              ? [
                  { label: "Hours recorded", value: fmt(records.reduce((sum, r) => sum + Number(r.hours), 0)) },
                  { label: "Technicians", value: String(new Set(records.map((r) => r.employeeId)).size) },
                  { label: "Working now", value: String(open) },
                ]
              : []),
            ...(showCosts && cost
              ? [
                  { label: "Labour cost", value: formatMoney(cost.labourTotal) },
                  { label: "Parts cost", value: formatMoney(cost.partsTotal) },
                  { label: "Total cost", value: formatMoney(cost.total) },
                ]
              : []),
          ].map((tile) => (
            <div key={tile.label} className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{tile.label}</p>
              <p className="mt-1 text-xl font-bold">{tile.value}</p>
            </div>
          ))}
          {showCosts && cost && seesPeople && records.length > 0 && (
            <p className="col-span-full text-xs text-gray-500">
              Labour uses each employee&apos;s hourly rate when the record was saved. Running sessions are added when they stop.
            </p>
          )}
        </div>
      </div>

      {seesPeople && (
        <div className="mt-5 space-y-5">
          <div className="card p-4">
            <h2 className="mb-3 font-semibold">Man-hour records</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>From</th>
                    <th>To</th>
                    <th className="text-right">Hours</th>
                    <th>Source</th>
                    {showCosts && <th className="text-right">Rate</th>}
                    {showCosts && <th className="text-right">Labour cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-gray-500">No time recorded on this job card yet.</td>
                    </tr>
                  )}
                  {records.map((record) => {
                    const labour = labourByRecord.get(record.id);
                    return (
                      <tr key={record.id}>
                        <td>{record.employee.fileNo} – {record.employee.name}</td>
                        <td>{formatDate(record.startDate)}</td>
                        <td>{formatDate(record.endDate)}</td>
                        <td className="text-right font-semibold">{fmt(Number(record.hours))}</td>
                        <td>{SOURCE_LABEL[record.source] ?? record.source}</td>
                        {showCosts && <td className="text-right">{labour ? formatMoney(labour.rate, false) : ""}</td>}
                        {showCosts && <td className="text-right">{labour ? formatMoney(labour.cost, false) : ""}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                QR work sessions
                {flagged > 0 && <span className="badge ml-2 bg-amber-200 text-amber-900">{flagged} need review</span>}
              </h2>
              <AddSessionButton jobCardId={card.id} employees={employees.map((e) => ({ id: e.id, label: `${e.fileNo} – ${e.name}` }))} />
            </div>
            <SessionsTable sessions={toSessionRows(user, sessions)} showJobCard={false} emptyText="No QR sessions on this job card." />
          </div>
        </div>
      )}

      {(isStore || showCosts) && (
        <div className="mt-5">
          <IssuePartsPanel jobCardId={card.id} closed={card.status === "CLOSED" && user.role !== "ADMIN"} issued={lines} canIssue={isStore} />
        </div>
      )}
    </>
  );
}
