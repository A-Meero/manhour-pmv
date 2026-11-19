import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageInventory } from "@/lib/auth/access";
import { formatDateTime } from "@/lib/dates";
import { formatMoney, formatQty } from "@/lib/money";
import { PageHeader } from "@/components/ui";

const KIND_LABEL = { RECEIVE: "Received", ADJUST: "Adjusted", ISSUE: "Issued", ISSUE_REVERSAL: "Returned" } as const;

/** Stock history of one part. */
export default async function PartHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage(canManageInventory);
  const { id } = await params;
  const part = await prisma.part.findUnique({ where: { id } });
  if (!part) notFound();
  const movements = await prisma.stockMovement.findMany({
    where: { partId: id },
    include: { user: { select: { name: true } }, jobCard: { select: { id: true, code: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  return (
    <>
      <PageHeader
        title={`${part.partNo} · ${part.name}`}
        description={`On hand ${formatQty(Number(part.qtyOnHand))} ${part.unit} · unit cost ${formatMoney(Number(part.unitCost))}`}
        actions={<Link href="/inventory" className="btn">Back to inventory</Link>}
      />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Change</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit cost</th>
              <th>Job card</th>
              <th>Note</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {movements.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">No stock changes yet.</td>
              </tr>
            )}
            {movements.map((movement) => {
              const qty = Number(movement.qty);
              return (
                <tr key={movement.id}>
                  <td className="whitespace-nowrap">{formatDateTime(movement.createdAt)}</td>
                  <td>{KIND_LABEL[movement.kind]}</td>
                  <td className={`text-right font-semibold ${qty < 0 ? "text-red-700" : "text-green-700"}`}>
                    {qty > 0 ? "+" : ""}
                    {formatQty(qty)}
                  </td>
                  <td className="text-right">{formatMoney(Number(movement.unitCost), false)}</td>
                  <td className="font-mono">
                    {movement.jobCard && <Link className="text-brand hover:underline" href={`/job-cards/${movement.jobCard.id}`}>{movement.jobCard.code}</Link>}
                  </td>
                  <td className="max-w-xs text-xs">{movement.note}</td>
                  <td>{movement.user?.name ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
