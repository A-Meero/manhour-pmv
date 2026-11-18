import { requireUser } from "@/lib/auth/guards";
import { navFor, ROLE_LABEL } from "@/lib/nav";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      nav={navFor(user)}
      user={{ name: user.name, role: ROLE_LABEL[user.role] ?? user.role, supervisor: user.supervisedEmployeeIds.length > 0 }}
    >
      {children}
    </AppShell>
  );
}
