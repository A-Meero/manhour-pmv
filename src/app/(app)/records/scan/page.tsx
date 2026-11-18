import Link from "next/link";
import { Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canEnterRecords, isAdmin } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { PageHeader, Alert } from "@/components/ui";
import { ScanUpload } from "@/components/scan-upload";

export default async function ScanPage() {
  const user = await requirePage(canEnterRecords);
  const [pending, settings] = await Promise.all([
    prisma.scanSheet.findMany({
      where: { status: "PENDING_REVIEW", ...(isAdmin(user) ? {} : { uploadedById: user.id }) },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { uploadedBy: { select: { name: true } } },
    }),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Scan a sheet"
        description="Take a photo of a filled, handwritten man hour sheet. The rows are read for you to check before saving."
        actions={
          <a href="/api/templates/sheet-pdf" target="_blank" className="btn">
            <Printer className="h-4 w-4" /> Blank sheet (PDF)
          </a>
        }
      />
      <div className="space-y-5">
        {!settings.claudeApiKey && (
          <Alert kind="warning">
            Photos are read with the offline reader (Tesseract), which often misreads handwriting. Please check every line carefully.
            {isAdmin(user) && (
              <>
                {" "}
                Add a Claude API key in <Link href="/settings" className="underline">Settings</Link> for much better results.
              </>
            )}
          </Alert>
        )}
        <ScanUpload />
        {pending.length > 0 && (
          <div className="card p-4">
            <h2 className="mb-3 font-semibold">Waiting for review</h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {pending.map((scan) => (
                <li key={scan.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {scan.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Kuwait" })}
                    {isAdmin(user) && scan.uploadedBy && <span className="text-gray-500"> · {scan.uploadedBy.name}</span>}
                  </span>
                  <Link href={`/records/scan/${scan.id}`} className="btn btn-sm">Review</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
