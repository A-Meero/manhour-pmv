import { requireUser } from "@/lib/auth/guards";
import { navFor } from "@/lib/nav";
import { userBadge } from "@/lib/auth/access";
import { AppShell } from "@/components/app-shell";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireUser(), getSettings()]);
  const badge = userBadge(user);
  return (
    <AppShell
      nav={navFor(user, settings.methods)}
      user={{ name: user.name, role: badge, supervisor: user.supervisedEmployeeIds.length > 0 && badge !== "Supervisor" }}
    >
      {children}
    </AppShell>
  );
}
