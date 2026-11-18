import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { normalizeCode } from "@/lib/masterdata";
import { getFieldDefinitions, toFieldDefs, validateCustomFields } from "@/lib/fields";
import { audit } from "@/lib/audit";

type EmployeeBody = {
  fileNo?: string;
  name?: string;
  jobTitle?: string;
  active?: boolean;
  supervisorIds?: string[];
  customFields?: Record<string, unknown>;
};

export const POST = withUser(async (request, user) => {
  const body = await readJson<EmployeeBody>(request);
  const fileNo = normalizeCode(body.fileNo);
  const name = body.name?.trim() ?? "";
  if (!fileNo || !name) throw new HttpError(400, "File no. and name are required.");
  if (await prisma.employee.findUnique({ where: { fileNo } })) throw new HttpError(409, `File no. ${fileNo} already exists.`);
  const custom = validateCustomFields(toFieldDefs(await getFieldDefinitions("EMPLOYEE")), body.customFields);
  if (custom.errors.length) throw new HttpError(400, custom.errors.join("; "));
  const supervisorIds = Array.from(new Set(body.supervisorIds ?? []));
  const validSupervisors = await prisma.user.count({ where: { id: { in: supervisorIds }, active: true } });
  if (validSupervisors !== supervisorIds.length) throw new HttpError(400, "One of the supervisors is not an active user.");

  const employee = await prisma.employee.create({
    data: {
      fileNo,
      name,
      jobTitle: body.jobTitle?.trim() ?? "",
      customFields: custom.values,
      supervisors: { create: supervisorIds.map((supervisorId) => ({ supervisorId })) },
    },
  });
  await audit(user.id, "EMPLOYEE_CREATED", "Employee", employee.id, { fileNo });
  return NextResponse.json({ id: employee.id });
}, canManageMasterData);
