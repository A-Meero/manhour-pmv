import { NextResponse } from "next/server";
import { canEnterRecords } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { createRecords } from "@/lib/records";

type Body = {
  employeeId?: string;
  preparedByName?: string;
  preparedByDate?: string;
  approvedByName?: string;
  approvedByDate?: string;
  rows?: {
    row?: number;
    jobCardCode?: string;
    startDate?: string;
    endDate?: string;
    hours?: string | number;
    remarks?: string;
    customFields?: Record<string, unknown>;
  }[];
};

/** Manual entry: one employee, one or more job card lines (like the paper sheet). */
export const POST = withUser(async (request, user) => {
  const body = await readJson<Body>(request);
  if (!body.employeeId) throw new HttpError(400, "Choose an employee.");
  const rows = (body.rows ?? []).filter((row) => row.jobCardCode || row.hours || row.startDate);
  if (rows.length === 0) throw new HttpError(400, "Add at least one job card line.");
  const result = await createRecords(
    rows.map((row, index) => ({
      row: row.row ?? index + 1,
      employeeId: body.employeeId,
      jobCardCode: row.jobCardCode,
      startDate: row.startDate,
      endDate: row.endDate,
      hours: row.hours,
      remarks: row.remarks,
      customFields: row.customFields,
      preparedByName: body.preparedByName,
      preparedByDate: body.preparedByDate,
      approvedByName: body.approvedByName,
      approvedByDate: body.approvedByDate,
    })),
    { actor: user, source: "MANUAL" },
  );
  return NextResponse.json(result);
}, canEnterRecords);
