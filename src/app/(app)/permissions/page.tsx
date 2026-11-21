import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageSettings } from "@/lib/auth/access";
import { PermissionsManager } from "@/components/permissions-manager";
import { PageHeader } from "@/components/ui";

export default async function PermissionsPage() {
  await requirePage(canManageSettings);
  const [groups, users] = await Promise.all([
    prisma.permissionGroup.findMany({ orderBy: { name: "asc" }, include: { members: { select: { userId: true } } } }),
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, isAdmin: true, active: true } }),
  ]);
  return (
    <>
      <PageHeader
        title="Permissions"
        description="Permission groups decide what users can do. A user gets everything their groups allow. Admins can always do everything. Supervisors also see and manage their assigned team (set on the Employees page)."
      />
      <PermissionsManager
        groups={groups.map((g) => ({ id: g.id, name: g.name, description: g.description, permissions: g.permissions, memberIds: g.members.map((m) => m.userId) }))}
        users={users}
      />
    </>
  );
}
