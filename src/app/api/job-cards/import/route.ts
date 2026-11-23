import { NextResponse } from "next/server";
import { allowedRepairTypes, canAddByPhoto } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { importJobCards } from "@/lib/job-card-entry";
import { parseWorkbook } from "@/lib/excel";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import { readExcelUpload } from "@/lib/upload";

export const POST = withUser(async (request, user) => {
  const { data, fileName } = await readExcelUpload(request);
  const fields = toFieldDefs(await getFieldDefinitions("JOB_CARD"));
  const { rows, missingColumns } = await parseWorkbook(data, "job-cards", fields);
  if (missingColumns.length) throw new HttpError(400, `Missing column(s): ${missingColumns.join(", ")}. Use the template.`);
  if (rows.length === 0) throw new HttpError(400, "The file has no data rows.");
  const summary = await importJobCards(
    rows.map((row) => ({ ...row.values, row: row.row, code: row.values.code, fields: row.fields })),
    { source: "EXCEL", actorId: user.id, fileName, isAdmin: user.isAdmin, allowedTypes: allowedRepairTypes(user) },
  );
  return NextResponse.json(summary);
}, canAddByPhoto);
