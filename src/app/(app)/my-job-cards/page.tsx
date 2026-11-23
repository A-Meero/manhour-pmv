import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { receivedCardsWhere } from "@/lib/received-cards";
import { REPAIR_TYPE_LABEL } from "@/lib/repair-type";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Job cards received by me (or by the employees I supervise): open them to see the details or request spare parts. */
export default async function MyJobCardsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const where = receivedCardsWhere(user);
  if (!where) redirect("/unauthorized");
  const { show = "open" } = await searchParams;
  const cards = await prisma.jobCard.findMany({
    where: { ...where, ...(show === "all" ? {} : { status: "OPEN", active: true }) },
    include: {
      asset: { select: { code: true, description: true } },
      receivedByEmployee: { select: { id: true, name: true } },
      partRequests: { select: { status: true } },
    },
    orderBy: [{ status: "desc" }, { dateIn: "desc" }, { createdAt: "desc" }],
    take: 300,
  });
  const team = user.supervisedEmployeeIds.length > 0;

  return (
    <>
      <PageHeader
        title="My Job Cards"
        description={`Job cards received by you${team ? " or by your team" : ""}. Open one to see its details or to request spare parts from the store.`}
      />
      <div className="mb-4 flex gap-2">
        <Link href="/my-job-cards" className={`btn btn-sm ${show !== "all" ? "btn-primary" : ""}`}>Open</Link>
        <Link href="/my-job-cards?show=all" className={`btn btn-sm ${show === "all" ? "btn-primary" : ""}`}>All</Link>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Job card</th>
              <th>Asset</th>
              <th>Type</th>
              <th>Date in</th>
              {team && <th>Received by</th>}
              <th>Part requests</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">No job cards.</td>
              </tr>
            )}
            {cards.map((card) => {
              const open = card.partRequests.filter((r) => r.status !== "FULFILLED").length;
              return (
                <tr key={card.id}>
                  <td className="font-mono">
                    <Link className="font-semibold text-brand hover:underline" href={`/job-cards/${card.id}`}>{card.code}</Link>
                  </td>
                  <td>{card.asset ? <><span className="font-mono">{card.asset.code}</span> {card.asset.description}</> : ""}</td>
                  <td>{card.repairType ? REPAIR_TYPE_LABEL[card.repairType] : ""}</td>
                  <td>{formatDate(card.dateIn)}</td>
                  {team && <td>{card.receivedByEmployee?.id === user.employeeId ? "Me" : card.receivedByEmployee?.name}</td>}
                  <td>{card.partRequests.length ? `${open} open / ${card.partRequests.length}` : ""}</td>
                  <td>{card.status === "OPEN" ? "Open" : "Closed"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
