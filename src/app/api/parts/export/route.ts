import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/auth/access";
import { withUser } from "@/lib/http";
import { buildSheet, xlsxResponse } from "@/lib/excel";
import { round3 } from "@/lib/money";

/** Stock list with value. */
export const GET = withUser(async () => {
  const parts = await prisma.part.findMany({ orderBy: { partNo: "asc" } });
  const data = await buildSheet(
    "Stock",
    [
      { header: "Part No.", key: "partNo" },
      { header: "Part Name", key: "name", width: 34 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Unit Cost (KWD)", key: "unitCost" },
      { header: "Qty On Hand", key: "qty" },
      { header: "Stock Value (KWD)", key: "value" },
      { header: "Low Stock Level", key: "minQty" },
      { header: "Active", key: "active", width: 10 },
    ],
    parts.map((part) => ({
      partNo: part.partNo,
      name: part.name,
      unit: part.unit,
      unitCost: Number(part.unitCost),
      qty: Number(part.qtyOnHand),
      value: round3(Number(part.unitCost) * Number(part.qtyOnHand)),
      minQty: part.minQty === null ? "" : Number(part.minQty),
      active: part.active ? "Yes" : "No",
    })),
  );
  return xlsxResponse(data, "stock.xlsx");
}, canManageInventory);
