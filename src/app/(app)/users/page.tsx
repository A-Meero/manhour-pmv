import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageUsers } from "@/lib/auth/access";
import { UsersManager } from "@/components/users-manager";
import { PageHeader } from "@/components/ui";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requirePage(canManageUsers);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const [users, employees, groups] = await Promise.all([
    prisma.user.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
        : {},
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        employee: { select: { id: true, fileNo: true, name: true } },
        groups: { select: { groupId: true } },
        _count: { select: { supervising: true } },
      },
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, fileNo: true, name: true, user: { select: { id: true } } },
    }),
    prisma.permissionGroup.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, description: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Admins have full access. Everyone else can do what their permission groups allow (Permissions page). Everyone sees their own records; supervisors also see their assigned employees."
      />
      <UsersManager
        meId={me.id}
        meIsAdmin={me.isAdmin}
        groups={groups}
        q={q}
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
          active: user.active,
          groupIds: user.groups.map((g) => g.groupId),
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
