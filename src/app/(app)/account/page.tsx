import { requireUser } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="My account" description={`${user.name} · ${user.email}`} />
      <ChangePasswordForm />
    </>
  );
}
