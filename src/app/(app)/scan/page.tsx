import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { scanKinds } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { QrScanner } from "@/components/qr-scanner";

/** Scan a job card, asset or inventory item QR from inside the portal (live camera on https; a photo otherwise). */
export default async function ScanPage() {
  const user = await requireUser();
  const { methods } = await getSettings();
  const kinds = scanKinds(user, methods);
  if (!kinds.length) redirect("/unauthorized");
  const names = [kinds.includes("jobcard") && "job card", kinds.includes("asset") && "asset", kinds.includes("part") && "inventory item"].filter(Boolean) as string[];
  const what = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
  return (
    <>
      <PageHeader
        title="Scan QR"
        description={`Hold a ${what} QR code in front of the camera; it opens as soon as it is recognised.${kinds.includes("jobcard") ? " Job cards: start or stop work, issue parts or close the card." : ""}`}
      />
      <QrScanner kinds={kinds} />
    </>
  );
}
