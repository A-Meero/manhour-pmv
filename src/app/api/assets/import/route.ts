import { NextResponse } from "next/server";
import { canManageAssets } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { parseWorkbook } from "@/lib/excel";
import { importAssets } from "@/lib/assets";
import { readExcelUpload } from "@/lib/upload";

export const POST = withUser(async (request, user) => {
  const { data, fileName } = await readExcelUpload(request);
  const { rows, missingColumns } = await parseWorkbook(data, "assets", []);
  if (missingColumns.length) throw new HttpError(400, `Missing column(s): ${missingColumns.join(", ")}. Use the template.`);
  if (rows.length === 0) throw new HttpError(400, "The file has no data rows.");
  const summary = await importAssets(
    rows.map((row) => ({ row: row.row, ...row.values, code: row.values.assetCode })),
    { source: "EXCEL", actorId: user.id, fileName },
  );
  return NextResponse.json(summary);
}, canManageAssets);
