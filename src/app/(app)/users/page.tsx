import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageMasterData } from "@/lib/auth/access";
import { UsersManager } from "@/components/users-manager";
import { PageHeader } from "@/components/ui";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requirePage(canManageMasterData);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const [users, employees] = await Promise.all([
    prisma.user.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
        : {},
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        employee: { select: { id: true, fileNo: true, name: true } },
        _count: { select: { supervising: true } },
      },
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, fileNo: true, name: true, user: { select: { id: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Admins have full access. Managers see all records and analytics and can edit records. Employees see their own records; supervisors see their assigned employees."
      />
      <UsersManager
        meId={me.id}
        q={q}
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          canEnterOwnRecords: user.canEnterOwnRecords,
          isStoreManager: user.isStoreManager,
          employee: user.employee,
          supervising: user._count.supervising,
        }))}
        employees={employees.map((employee) => ({
          id: employee.id,
          label: `${employee.fileNo} – ${employee.name}`,
          linkedUserId: employee.user?.id ?? null,
        }))}
      />
    </>
  );
}
