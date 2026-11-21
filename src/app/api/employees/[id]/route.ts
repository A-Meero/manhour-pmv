import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageEmployees } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { normalizeCode, parseAmount } from "@/lib/masterdata";
import { getFieldDefinitions, toFieldDefs, validateCustomFields } from "@/lib/fields";
import { audit } from "@/lib/audit";
import { readShiftId } from "@/lib/shift-body";

type Ctx = { params: Promise<{ id: string }> };
type EmployeeBody = {
  fileNo?: string;
  name?: string;
  jobTitle?: string;
  hourlyRate?: string | number;
  shiftId?: string | null;
  active?: boolean;
  supervisorIds?: string[];
  customFields?: Record<string, unknown>;
};

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<EmployeeBody>(request);
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Employee not found.");

  const fileNo = body.fileNo !== undefined ? normalizeCode(body.fileNo) : existing.fileNo;
  if (!fileNo) throw new HttpError(400, "File no. is required.");
  if (fileNo !== existing.fileNo && (await prisma.employee.findUnique({ where: { fileNo } }))) {
    throw new HttpError(409, `File no. ${fileNo} already exists.`);
  }
  const name = body.name !== undefined ? body.name.trim() : existing.name;
  if (!name) throw new HttpError(400, "Name is required.");

  const hourlyRate = body.hourlyRate !== undefined ? parseAmount(body.hourlyRate) : undefined;
  if (hourlyRate === null || (hourlyRate !== undefined && hourlyRate < 0)) throw new HttpError(400, "Hourly rate must be a number of 0 or more.");
  const shiftId = await readShiftId(body.shiftId);
  let customFields = existing.customFields as Record<string, unknown>;
  if (body.customFields) {
    const custom = validateCustomFields(toFieldDefs(await getFieldDefinitions("EMPLOYEE")), body.customFields);
    if (custom.errors.length) throw new HttpError(400, custom.errors.join("; "));
    customFields = custom.values;
  }

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id },
      data: {
        fileNo,
        name,
        jobTitle: body.jobTitle !== undefined ? body.jobTitle.trim() : existing.jobTitle,
        ...(body.hourlyRate !== undefined ? { hourlyRate: hourlyRate ?? 0 } : {}),
        ...(shiftId !== undefined ? { shiftId } : {}),
        active: body.active ?? existing.active,
        customFields: customFields as Prisma.InputJsonValue,
      },
    });
    if (body.supervisorIds) {
      const supervisorIds = Array.from(new Set(body.supervisorIds));
      const valid = await tx.user.count({ where: { id: { in: supervisorIds } } });
      if (valid !== supervisorIds.length) throw new HttpError(400, "One of the supervisors was not found.");
      await tx.employeeSupervisor.deleteMany({ where: { employeeId: id } });
      if (supervisorIds.length) {
        await tx.employeeSupervisor.createMany({ data: supervisorIds.map((supervisorId) => ({ employeeId: id, supervisorId })) });
      }
    }
  });
  await audit(user.id, "EMPLOYEE_UPDATED", "Employee", id, body);
  return NextResponse.json({ ok: true });
}, canManageEmployees);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const [count, sessions] = await Promise.all([
    prisma.manHourRecord.count({ where: { employeeId: id } }),
    prisma.workSession.count({ where: { employeeId: id } }),
  ]);
  if (count + sessions > 0) throw new HttpError(409, `This employee has ${count} record(s) or QR sessions. Deactivate the employee instead.`);
  await prisma.employee.delete({ where: { id } });
  await audit(user.id, "EMPLOYEE_DELETED", "Employee", id);
  return NextResponse.json({ ok: true });
}, canManageEmployees);
