import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageMasterData } from "@/lib/auth/access";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import { EmployeesManager } from "@/components/employees-manager";
import { PageHeader, Pagination } from "@/components/ui";
import type { ClientField } from "@/components/custom-field-inputs";

const PAGE_SIZE = 50;

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePage(canManageMasterData);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status ?? "all";
  const supervisorId = params.supervisorId ?? "";
  const page = Math.max(1, Number(params.page) || 1);
  const where = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { fileNo: { contains: q, mode: "insensitive" as const } },
            { jobTitle: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
    ...(supervisorId ? { supervisors: { some: { supervisorId } } } : {}),
  };
  const [total, employees, users, fields] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        supervisors: { include: { supervisor: { select: { id: true, name: true } } } },
        user: { select: { email: true } },
        _count: { select: { records: true } },
      },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, role: true } }),
    getFieldDefinitions("EMPLOYEE"),
  ]);

  return (
    <>
      <PageHeader title="Employees" description="Employee records. File numbers are unique; supervisors can be any user." />
      <EmployeesManager
        fields={toFieldDefs(fields) as ClientField[]}
        users={users}
        filters={{ q, status, supervisorId }}
        employees={employees.map((employee) => ({
          id: employee.id,
          fileNo: employee.fileNo,
          name: employee.name,
          jobTitle: employee.jobTitle,
          active: employee.active,
          source: employee.source,
          customFields: employee.customFields as Record<string, string | number | boolean | null>,
          supervisors: employee.supervisors.map((entry) => entry.supervisor),
          login: employee.user?.email ?? null,
          records: employee._count.records,
        }))}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/employees" params={{ q, status, supervisorId }} />
    </>
  );
}
