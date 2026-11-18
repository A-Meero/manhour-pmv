import { NextResponse } from "next/server";
import { canEnterRecords } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { importRecords } from "@/lib/records";
import { parseWorkbook } from "@/lib/excel";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import { readExcelUpload } from "@/lib/upload";

export const POST = withUser(async (request, user) => {
  const { data, fileName } = await readExcelUpload(request);
  const fields = toFieldDefs(await getFieldDefinitions("RECORD"));
  const { rows, missingColumns } = await parseWorkbook(data, "records", fields);
  if (missingColumns.length) throw new HttpError(400, `Missing column(s): ${missingColumns.join(", ")}. Use the template.`);
  if (rows.length === 0) throw new HttpError(400, "The file has no data rows.");
  const summary = await importRecords(
    rows.map((row) => ({
      row: row.row,
      employeeFileNo: row.values.employeeFileNo,
      jobCardCode: row.values.jobCardCode,
      startDate: row.values.startDate,
      endDate: row.values.endDate,
      hours: row.values.hours,
      remarks: row.values.remarks,
      preparedByName: row.values.preparedByName,
      preparedByDate: row.values.preparedByDate,
      approvedByName: row.values.approvedByName,
      approvedByDate: row.values.approvedByDate,
      customFields: row.fields,
    })),
    user,
    { source: "EXCEL", fileName },
  );
  return NextResponse.json(summary);
}, canEnterRecords);
