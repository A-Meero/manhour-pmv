import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canUseScanPage } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { QrScanner } from "@/components/qr-scanner";

/** Scan a job card QR from inside the portal (photo works over plain http; live camera needs HTTPS). */
export default async function ScanJobCardPage() {
  const user = await requireUser();
  const { methods } = await getSettings();
  if (!canUseScanPage(user, methods)) redirect("/unauthorized");
  return (
    <>
      <PageHeader title="Scan job card" description="Scan the QR code on the job card to start or stop work, issue parts or close it." />
      <QrScanner />
    </>
  );
}
