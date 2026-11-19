import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canViewAnalytics, getViewScope } from "@/lib/auth/access";
import { getAnalytics } from "@/lib/analytics";
import { getSettings } from "@/lib/settings";
import { addDays, formatDate, parseDate, todayUtc, toIsoDate, weekStart } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { BarList, ColumnChart } from "@/components/charts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
const fmt = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage(canViewAnalytics);
  const params = await searchParams;
  const settings = await getSettings();
  const today = todayUtc();
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
  let from = parseDate(params.from) ?? defaultFrom;
  let to = parseDate(params.to) ?? today;
  if (to < from) [from, to] = [to, from];
  const employeeId = params.employeeId ?? "";
  const jobCard = params.jobCard?.trim().toUpperCase() ?? "";

  const [data, employees] = await Promise.all([
    getAnalytics({ from, to, employeeId: employeeId || undefined, jobCardCode: jobCard || undefined }, getViewScope(user), settings.weekStartDay),
    prisma.employee.findMany({ orderBy: { name: "asc" }, select: { id: true, fileNo: true, name: true } }),
  ]);

  const wk = weekStart(today, settings.weekStartDay);
  const presets = [
    { label: "This week", from: wk, to: addDays(wk, 6) },
    { label: "Last week", from: addDays(wk, -7), to: addDays(wk, -1) },
    { label: "This month", from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), to: today },
    { label: "Last 3 months", from: defaultFrom, to: today },
    { label: "This year", from: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)), to: today },
  ];
  const presetHref = (p: { from: Date; to: Date }) =>
    `/analytics?${new URLSearchParams({ from: toIsoDate(p.from), to: toIsoDate(p.to), ...(employeeId ? { employeeId } : {}), ...(jobCard ? { jobCard } : {}) })}`;
  const recordsHref = `/records?${new URLSearchParams({ from: toIsoDate(from), to: toIsoDate(to), ...(employeeId ? { employeeId } : {}), ...(jobCard ? { jobCard } : {}) })}`;

  const tiles = [
    { label: "Total hours", value: fmt(data.totals.hours) },
    { label: "Records", value: fmt(data.totals.records) },
    { label: "Employees", value: fmt(data.totals.employees) },
    { label: "Job cards", value: fmt(data.totals.jobCards) },
    { label: "Avg hours / employee", value: fmt(data.totals.avgPerEmployee) },
    { label: "Labour cost", value: formatMoney(data.totals.labourCost) },
    { label: "Parts cost", value: employeeId ? "–" : formatMoney(data.totals.partsCost) },
    { label: "Total cost", value: formatMoney(data.totals.labourCost + (employeeId ? 0 : data.totals.partsCost)) },
  ];

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`${formatDate(from)} – ${formatDate(to)} · weeks start on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][settings.weekStartDay]}. Hours of multi-day records are spread evenly over their days.`}
        actions={<Link href={recordsHref} className="btn">View these records</Link>}
      />

      <form action="/analytics" className="card mb-3 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <input type="date" name="from" defaultValue={toIsoDate(from)} className="input" aria-label="From" />
        <input type="date" name="to" defaultValue={toIsoDate(to)} className="input" aria-label="To" />
        <select name="employeeId" defaultValue={employeeId} className="input">
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.fileNo} – {employee.name}</option>
          ))}
        </select>
        <input name="jobCard" defaultValue={jobCard} placeholder="Job card (exact)" className="input" />
        <button className="btn btn-primary">Apply</button>
      </form>
      <div className="mb-5 flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Link key={preset.label} href={presetHref(preset)} className="btn btn-sm">{preset.label}</Link>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{tile.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Hours per month</h2>
          <ColumnChart data={data.byMonth.map((m) => ({ label: monthLabel(m.key), detail: monthLabel(m.key), value: m.hours }))} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Hours per week</h2>
          <ColumnChart
            data={data.byWeek.map((w) => {
              const start = new Date(`${w.key}T00:00:00.000Z`);
              return { label: formatDate(start).slice(0, 5), detail: `Week ${formatDate(start)} – ${formatDate(addDays(start, 6))}`, value: w.hours };
            })}
          />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Top employees</h2>
          <BarList data={data.byEmployee.map((e) => ({ label: e.name, sub: e.fileNo, value: e.hours }))} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Top job cards</h2>
          <BarList data={data.byJobCard.map((c) => ({ label: c.code, sub: `${c.employees} employee(s)`, value: c.hours }))} />
        </section>
      </div>

      <section className="mb-5">
        <h2 className="mb-2 font-semibold">Hours per employee per month</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>File No.</th>
                <th>Employee</th>
                {data.employeeMonths.months.map((month) => (
                  <th key={month} className="text-right">{monthLabel(month)}</th>
                ))}
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.employeeMonths.rows.length === 0 && (
                <tr>
                  <td colSpan={3 + data.employeeMonths.months.length} className="py-6 text-center text-gray-500">No records in this period.</td>
                </tr>
              )}
              {data.employeeMonths.rows.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono">{row.fileNo}</td>
                  <td className="whitespace-nowrap">{row.name}</td>
                  {row.values.map((value, index) => (
                    <td key={index} className="text-right">{value ? fmt(value) : <span className="text-gray-300">–</span>}</td>
                  ))}
                  <td className="text-right font-semibold">{fmt(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Job cards</h2>
        <div className="table-wrap max-h-[480px] overflow-y-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Job Card</th>
                <th className="text-right">Employees</th>
                <th className="text-right">Records</th>
                <th className="text-right">Hours in period</th>
                <th className="text-right">Labour</th>
                <th className="text-right">Parts</th>
                <th className="text-right">Total cost</th>
              </tr>
            </thead>
            <tbody>
              {data.byJobCard.map((card) => (
                <tr key={card.code}>
                  <td className="font-mono">
                    <Link className="hover:underline" href={`/analytics?${new URLSearchParams({ from: toIsoDate(from), to: toIsoDate(to), jobCard: card.code })}`}>{card.code}</Link>
                  </td>
                  <td className="text-right">{card.employees}</td>
                  <td className="text-right">{card.records}</td>
                  <td className="text-right font-semibold">{fmt(card.hours)}</td>
                  <td className="text-right">{formatMoney(card.labourCost, false)}</td>
                  <td className="text-right">{formatMoney(card.partsCost, false)}</td>
                  <td className="text-right font-semibold">{formatMoney(card.labourCost + card.partsCost, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
