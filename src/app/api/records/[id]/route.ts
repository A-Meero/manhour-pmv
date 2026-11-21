import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canDeleteRecords, canEditRecords, getViewScope, scopeAllows } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { updateRecord, type RecordUpdate } from "@/lib/records";
import { audit } from "@/lib/audit";
import { toIsoDate } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<RecordUpdate>(request);
  const errors = await updateRecord(id, body, user);
  if (errors) throw new HttpError(400, errors.join("; "), errors);
  return NextResponse.json({ ok: true });
}, canEditRecords);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const record = await prisma.manHourRecord.findUnique({ where: { id }, include: { jobCard: true, employee: true } });
  if (!record || !scopeAllows(getViewScope(user), record.employeeId)) throw new HttpError(404, "Record not found.");
  await prisma.$transaction([
    // A QR record is the sum of its work sessions, so they go with it.
    ...(record.source === "QR" ? [prisma.workSession.deleteMany({ where: { employeeId: record.employeeId, jobCardId: record.jobCardId } })] : []),
    prisma.manHourRecord.delete({ where: { id } }),
  ]);
  await audit(user.id, "RECORD_DELETED", "ManHourRecord", id, {
    employee: record.employee.fileNo,
    jobCard: record.jobCard.code,
    startDate: toIsoDate(record.startDate),
    endDate: toIsoDate(record.endDate),
    hours: Number(record.hours),
  });
  return NextResponse.json({ ok: true });
}, canDeleteRecords);
