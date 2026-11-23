import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password-form";
import { PushSettings } from "@/components/push-settings";

export default async function AccountPage() {
  const user = await requireUser();
  const [account, devices] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { mutedPushKinds: true } }),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
  ]);
  return (
    <>
      <PageHeader title="My account" description={`${user.name} · ${user.email}`} />
      <ChangePasswordForm />
      <PushSettings muted={account.mutedPushKinds} devices={devices} />
    </>
  );
}
