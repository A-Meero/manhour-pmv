import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { toClient } from "@/lib/notifications";
import { NotificationList } from "@/components/notification-list";
import { PageHeader } from "@/components/ui";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Notifications" description="Your latest 200 notifications." />
      <NotificationList items={items.map(toClient)} />
    </>
  );
}
