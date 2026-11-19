import { NextResponse } from "next/server";
import { canManageInventory } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { parseWorkbook } from "@/lib/excel";
import { importParts } from "@/lib/inventory";
import { readExcelUpload } from "@/lib/upload";

export const POST = withUser(async (request, user) => {
  const { data, fileName } = await readExcelUpload(request);
  const { rows, missingColumns } = await parseWorkbook(data, "parts", []);
  if (missingColumns.length) throw new HttpError(400, `Missing column(s): ${missingColumns.join(", ")}. Use the template.`);
  if (rows.length === 0) throw new HttpError(400, "The file has no data rows.");
  const summary = await importParts(
    rows.map((row) => ({
      row: row.row,
      partNo: row.values.partNo,
      name: row.values.name,
      unit: row.values.unit,
      unitCost: row.values.unitCost,
      qtyOnHand: row.values.qtyOnHand,
      minQty: row.values.minQty,
    })),
    { source: "EXCEL", actorId: user.id, fileName },
  );
  return NextResponse.json(summary);
}, canManageInventory);
