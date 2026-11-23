import { requireUser } from "@/lib/auth/guards";
import { navFor } from "@/lib/nav";
import { canManageInventory, canUploadDocument, userBadge } from "@/lib/auth/access";
import { NEEDS_DOCUMENT_WHERE } from "@/lib/job-card-files";
import { openPartRequestCount } from "@/lib/part-requests";
import { receivedCardsWhere } from "@/lib/received-cards";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { getSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireUser(), getSettings()]);
  const badge = userBadge(user);
  const received = receivedCardsWhere(user);
  const [openPartRequests, receivedCards, needDocument] = await Promise.all([
    canManageInventory(user) ? openPartRequestCount() : 0,
    received ? prisma.jobCard.count({ where: received }) : 0,
    canUploadDocument(user) ? prisma.jobCard.count({ where: NEEDS_DOCUMENT_WHERE }) : 0,
  ]);
  return (
    <AppShell
      nav={navFor(user, settings.methods, { openPartRequests, receivedCards })}
      user={{ name: user.name, role: badge, supervisor: user.supervisedEmployeeIds.length > 0 && badge !== "Supervisor" }}
      needDocument={needDocument}
    >
      {children}
    </AppShell>
  );
}
