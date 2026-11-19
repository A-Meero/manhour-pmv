import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageInventory } from "@/lib/auth/access";
import { PageHeader, Pagination } from "@/components/ui";
import { InventoryManager } from "@/components/inventory-manager";

const PAGE_SIZE = 100;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage(canManageInventory);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const show = params.show ?? "active";
  const page = Math.max(1, Number(params.page) || 1);
  const where: Prisma.PartWhereInput = {
    ...(q ? { OR: [{ partNo: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(show === "active" ? { active: true } : {}),
    ...(show === "low" ? { active: true, minQty: { not: null }, qtyOnHand: { lte: prisma.part.fields.minQty } } : {}),
  };
  const [total, parts, all] = await Promise.all([
    prisma.part.count({ where }),
    prisma.part.findMany({ where, orderBy: { partNo: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.part.findMany({ where, select: { qtyOnHand: true, unitCost: true } }),
  ]);
  const totalValue = all.reduce((sum, part) => sum + Number(part.qtyOnHand) * Number(part.unitCost), 0);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Spare parts in the store. Issue parts to a job card by scanning its QR code (or from the job card page)."
      />
      <InventoryManager
        filters={{ q, show }}
        totalValue={totalValue}
        parts={parts.map((part) => ({
          id: part.id,
          partNo: part.partNo,
          name: part.name,
          unit: part.unit,
          unitCost: Number(part.unitCost),
          qtyOnHand: Number(part.qtyOnHand),
          minQty: part.minQty === null ? null : Number(part.minQty),
          active: part.active,
        }))}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/inventory" params={{ q, show }} />
    </>
  );
}
