import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/auth/access";
import { addDays, formatDateTime, parseDate } from "@/lib/dates";
import { PageHeader, Pagination } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Admins: who did what and when (everything the app records in its audit log), with filters. */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage(isAdmin);
  const params = await searchParams;
  const from = parseDate(params.from);
  const to = parseDate(params.to);
  const userId = params.user ?? "";
  const action = params.action ?? "";
  const entity = params.entity ?? "";
  const q = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(from || to
      ? {
          createdAt: {
            // Kuwait days (UTC+3); times are stored in UTC
            ...(from ? { gte: new Date(from.getTime() - 3 * 3600_000) } : {}),
            ...(to ? { lt: new Date(addDays(to, 1).getTime() - 3 * 3600_000) } : {}),
          },
        }
      : {}),
    ...(userId ? { userId } : {}),
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
  };
  if (q) {
    // Free text: the action, record type / id, or anything in the details
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "AuditLog"
      WHERE details::text ILIKE ${like} OR action ILIKE ${like} OR entity ILIKE ${like} OR "entityId" ILIKE ${like}
      ORDER BY "createdAt" DESC LIMIT 5000`;
    where.id = { in: ids.map((row) => row.id) };
  }

  const [total, rows, users, actions, entities] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    prisma.auditLog.groupBy({ by: ["entity"], orderBy: { entity: "asc" } }),
  ]);
  const keep = { from: params.from ?? "", to: params.to ?? "", user: userId, action, entity, q };

  return (
    <>
      <PageHeader title="Audit Log" description="Everything changed in the app: who did it, when, and the details. Times are Kuwait time." />
      <form className="card mb-4 grid gap-2 p-4 sm:grid-cols-3 lg:grid-cols-6" action="/audit">
        <input type="date" name="from" defaultValue={keep.from} className="input" aria-label="From" />
        <input type="date" name="to" defaultValue={keep.to} className="input" aria-label="To" />
        <select name="user" defaultValue={userId} className="input" aria-label="User">
          <option value="">All users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select name="action" defaultValue={action} className="input" aria-label="Action">
          <option value="">All actions</option>
          {actions.map((a) => (
            <option key={a.action} value={a.action}>{a.action.replace(/_/g, " ").toLowerCase()}</option>
          ))}
        </select>
        <select name="entity" defaultValue={entity} className="input" aria-label="Record type">
          <option value="">All record types</option>
          {entities.map((e) => (
            <option key={e.entity} value={e.entity}>{e.entity}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search details" className="input" />
          <button className="btn">Filter</button>
        </div>
      </form>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>User</th>
              <th>Action</th>
              <th>Record</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">Nothing found.</td>
              </tr>
            )}
            {rows.map((row) => {
              const details = JSON.stringify(row.details, null, 2);
              const short = JSON.stringify(row.details);
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                  <td>{row.user?.name ?? <span className="text-gray-400">system / API</span>}</td>
                  <td className="whitespace-nowrap">{row.action.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="whitespace-nowrap text-xs">
                    {row.entity}
                    {row.entityId && <span className="block font-mono text-gray-500">{row.entityId}</span>}
                  </td>
                  <td className="max-w-md text-xs">
                    {short === "{}" ? (
                      ""
                    ) : short.length <= 90 ? (
                      <code className="break-all">{short}</code>
                    ) : (
                      <details>
                        <summary className="cursor-pointer break-all">{short.slice(0, 90)}…</summary>
                        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2">{details}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/audit" params={keep} />
    </>
  );
}
