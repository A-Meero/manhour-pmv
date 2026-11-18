import Link from "next/link";
import { Camera, ChartColumn, FileSpreadsheet, List, Plus, Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { canEnterRecords, canViewAnalytics, getViewScope, scopeWhere } from "@/lib/auth/access";
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

  const [weekAgg, monthAgg, pendingScans, recent] = await Promise.all([
    prisma.manHourRecord.aggregate({ where: { ...base, startDate: { gte: wk, lte: addDays(wk, 6) } }, _sum: { hours: true }, _count: true }),
    prisma.manHourRecord.aggregate({ where: { ...base, startDate: { gte: monthStart } }, _sum: { hours: true }, _count: true }),
    canEnterRecords(user) ? prisma.scanSheet.count({ where: { status: "PENDING_REVIEW", uploadedById: user.id } }) : Promise.resolve(0),
    prisma.manHourRecord.findMany({
      where: base,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { employee: { select: { name: true, fileNo: true } }, jobCard: { select: { code: true } } },
    }),
  ]);

  const actions = [
    ...(canEnterRecords(user)
      ? [
          { href: "/records/new", label: "New entry", icon: Plus },
          { href: "/records/scan", label: "Scan a sheet", icon: Camera },
          { href: "/records/import", label: "Import Excel", icon: FileSpreadsheet },
        ]
      : []),
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
