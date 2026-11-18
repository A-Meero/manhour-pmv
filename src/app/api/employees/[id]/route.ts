import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { normalizeCode } from "@/lib/masterdata";
import { getFieldDefinitions, toFieldDefs, validateCustomFields } from "@/lib/fields";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
type EmployeeBody = {
  fileNo?: string;
  name?: string;
  jobTitle?: string;
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
}, canManageMasterData);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const count = await prisma.manHourRecord.count({ where: { employeeId: id } });
  if (count > 0) throw new HttpError(409, `This employee has ${count} record(s). Deactivate the employee instead.`);
  await prisma.employee.delete({ where: { id } });
  await audit(user.id, "EMPLOYEE_DELETED", "Employee", id);
  return NextResponse.json({ ok: true });
}, canManageMasterData);
