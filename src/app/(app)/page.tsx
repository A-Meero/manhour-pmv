import Link from "next/link";
import { Camera, ChartColumn, Clock, CreditCard, FileSpreadsheet, List, Package, Plus, Printer, Timer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import {
  canBrowseJobCards,
  canEnterRecords,
  canManageInventory,
  canReviewSessions,
  canScanTime,
  canViewAnalytics,
  getViewScope,
  methodAllowed,
  scopeWhere,
} from "@/lib/auth/access";
import { autoStopStale, reviewScopeWhere, sessionHours } from "@/lib/work-sessions";
import { formatTime } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { addDays, todayUtc, weekStart } from "@/lib/dates";
import { PageHeader } from "@/components/ui";

const fmt = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function HomePage() {
  const user = await requireUser();
  const settings = await getSettings();
  const scope = getViewScope(user);
  const today = todayUtc();
  const wk = weekStart(today, settings.weekStartDay);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const base = scopeWhere(scope);
  const allowed = (method: "manual" | "excel" | "photo" | "qr") => methodAllowed(user, settings.methods, method);
  const scans = canScanTime(user, settings.methods);
  const reviews = allowed("qr") && canReviewSessions(user);
  if (scans && user.employeeId) await autoStopStale({ employeeId: user.employeeId });
  if (reviews) await autoStopStale(reviewScopeWhere(user));

  const [running, toReview, lowStock] = await Promise.all([
    scans && user.employeeId
      ? prisma.workSession.findFirst({ where: { employeeId: user.employeeId, endedAt: null }, include: { jobCard: { select: { code: true } } } })
      : Promise.resolve(null),
    reviews ? prisma.workSession.count({ where: { ...reviewScopeWhere(user), needsReview: true } }) : Promise.resolve(0),
    canManageInventory(user)
      ? prisma.part.count({ where: { active: true, minQty: { not: null }, qtyOnHand: { lte: prisma.part.fields.minQty } } })
      : Promise.resolve(0),
  ]);
  const [weekAgg, monthAgg, pendingScans, recent] = await Promise.all([
    prisma.manHourRecord.aggregate({ where: { ...base, startDate: { gte: wk, lte: addDays(wk, 6) } }, _sum: { hours: true }, _count: true }),
    prisma.manHourRecord.aggregate({ where: { ...base, startDate: { gte: monthStart } }, _sum: { hours: true }, _count: true }),
    canEnterRecords(user) && allowed("photo") ? prisma.scanSheet.count({ where: { status: "PENDING_REVIEW", uploadedById: user.id } }) : Promise.resolve(0),
    prisma.manHourRecord.findMany({
      where: base,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { employee: { select: { name: true, fileNo: true } }, jobCard: { select: { code: true } } },
    }),
  ]);

  const actions = [
    ...(scans ? [{ href: "/my-work", label: "My work", icon: Timer }] : []),
    ...(canEnterRecords(user) && allowed("manual") ? [{ href: "/records/new", label: "New entry", icon: Plus }] : []),
    ...(canEnterRecords(user) && allowed("photo") ? [{ href: "/records/scan", label: "Scan a sheet", icon: Camera }] : []),
    ...(canEnterRecords(user) && allowed("excel") ? [{ href: "/records/import", label: "Import Excel", icon: FileSpreadsheet }] : []),
    ...(reviews ? [{ href: "/sessions", label: "Work sessions", icon: Clock }] : []),
    ...(canBrowseJobCards(user) ? [{ href: "/job-cards", label: "Job cards", icon: CreditCard }] : []),
    ...(canManageInventory(user) ? [{ href: "/inventory", label: "Inventory", icon: Package }] : []),
    { href: "/records", label: "Records", icon: List },
    ...(canViewAnalytics(user) ? [{ href: "/analytics", label: "Analytics", icon: ChartColumn }] : []),
  ];

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className="card flex flex-col items-center gap-2 p-4 text-center text-sm font-medium hover:border-brand hover:text-brand">
            <action.icon className="h-6 w-6" />
            {action.label}
          </Link>
        ))}
      </div>

      {running && (
        <Link
          href={`/jc/${encodeURIComponent(running.jobCard.code)}`}
          className="mb-5 block rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          You are working on <b className="font-mono">{running.jobCard.code}</b> since {formatTime(running.startedAt)} (
          {fmt(sessionHours(running.startedAt, null))}h). Tap to stop →
        </Link>
      )}
      {toReview > 0 && (
        <Link href="/sessions" className="mb-5 block rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {toReview} QR work session(s) need review (no stop scan, or over the hour limits) →
        </Link>
      )}
      {lowStock > 0 && (
        <Link href="/inventory?show=low" className="mb-5 block rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {lowStock} spare part(s) are at or below their low stock level →
        </Link>
      )}
      {pendingScans > 0 && (
        <Link href="/records/scan" className="mb-5 block rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You have {pendingScans} scanned sheet(s) waiting for review →
        </Link>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Hours this week", value: fmt(Number(weekAgg._sum.hours ?? 0)) },
          { label: "Records this week", value: fmt(weekAgg._count) },
          { label: "Hours this month", value: fmt(Number(monthAgg._sum.hours ?? 0)) },
          { label: "Records this month", value: fmt(monthAgg._count) },
        ].map((tile) => (
          <div key={tile.label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{tile.label}</p>
            <p className="mt-1 text-2xl font-bold">{tile.value}</p>
          </div>
        ))}
      </div>
      <p className="-mt-3 mb-5 text-xs text-gray-500">Counted by start date{scope === "ALL" ? "" : ", for you and the employees you supervise"}.</p>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Latest records</h2>
          <a href="/api/templates/sheet-pdf" target="_blank" className="btn btn-sm">
            <Printer className="h-3.5 w-3.5" /> Blank sheet
          </a>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">No records yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {recent.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{record.employee.name}</span>
                  <span className="text-gray-500"> · </span>
                  <span className="font-mono">{record.jobCard.code}</span>
                </span>
                <span className="shrink-0 font-semibold">{fmt(Number(record.hours))}h</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
