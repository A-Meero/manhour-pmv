import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { getEntryScope, employeeScopeWhere } from "@/lib/auth/access";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import type { ClientField } from "@/components/custom-field-inputs";
import type { EmployeeOption } from "@/components/record-entry";

/** Active employees the user may enter records for, plus the record custom fields. */
export async function getEntryData(user: CurrentUser): Promise<{ employees: EmployeeOption[]; fields: ClientField[] }> {
  const [employees, fields] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true, ...employeeScopeWhere(getEntryScope(user)) },
      orderBy: { name: "asc" },
      include: { supervisors: { include: { supervisor: { select: { name: true } } } } },
    }),
    getFieldDefinitions("RECORD"),
  ]);
  return {
    employees: employees.map((employee) => ({
      id: employee.id,
      fileNo: employee.fileNo,
      name: employee.name,
      jobTitle: employee.jobTitle,
      supervisorName: employee.supervisors.map((entry) => entry.supervisor.name).join(", "),
    })),
    fields: toFieldDefs(fields) as ClientField[],
  };
}
