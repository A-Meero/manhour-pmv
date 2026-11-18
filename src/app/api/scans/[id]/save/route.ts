import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canEnterRecords, isAdmin } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { createRecords } from "@/lib/records";

type Ctx = { params: Promise<{ id: string }> };
type Body = {
  employeeId?: string;
  preparedByName?: string;
  preparedByDate?: string;
  approvedByName?: string;
  approvedByDate?: string;
  rows?: { row?: number; jobCardCode?: string; startDate?: string; endDate?: string; hours?: string; remarks?: string; customFields?: Record<string, unknown> }[];
};

/** Saves the reviewed rows of a photographed sheet. Valid rows are saved; invalid ones are returned for fixing. */
export const POST = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const scan = await prisma.scanSheet.findUnique({ where: { id } });
  if (!scan) throw new HttpError(404, "Scan not found.");
  if (!isAdmin(user) && scan.uploadedById !== user.id) throw new HttpError(403, "You can only save your own scans.");
  if (scan.status === "DISCARDED") throw new HttpError(400, "This scan was discarded.");

  const body = await readJson<Body>(request);
  if (!body.employeeId) throw new HttpError(400, "Choose the employee.");
  const rows = (body.rows ?? []).filter((row) => row.jobCardCode || row.hours || row.startDate);
  if (rows.length === 0) throw new HttpError(400, "There are no rows to save.");

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
    { actor: user, source: "PHOTO", scanId: id },
  );
  if (result.invalid.length === 0) {
    await prisma.scanSheet.update({ where: { id }, data: { status: "SAVED" } });
  }
  return NextResponse.json(result);
}, canEnterRecords);
