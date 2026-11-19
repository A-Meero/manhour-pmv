import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMethodPage } from "@/lib/auth/guards";
import { isAdmin } from "@/lib/auth/access";
import { getEntryData } from "@/lib/entry-data";
import { normalizeCode } from "@/lib/masterdata";
import { PageHeader } from "@/components/ui";
import { ScanReview } from "@/components/scan-review";
import type { ExtractedSheet } from "@/lib/ocr";

export default async function ScanReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireMethodPage("photo");
  const { id } = await params;
  const scan = await prisma.scanSheet.findUnique({ where: { id }, include: { _count: { select: { records: true } } } });
  if (!scan) notFound();
  if (!isAdmin(user) && scan.uploadedById !== user.id) redirect("/unauthorized");

  const { employees, fields } = await getEntryData(user);
  const sheet = scan.extracted as unknown as ExtractedSheet;
  const fileNo = normalizeCode(sheet?.employeeFileNo);
  const matched =
    employees.find((employee) => employee.fileNo === fileNo) ??
    (employees.length === 1 ? employees[0] : undefined) ??
    employees.find((employee) => sheet?.employeeName && employee.name.toLowerCase() === sheet.employeeName.trim().toLowerCase());

  return (
    <>
      <PageHeader title="Review scanned sheet" description="Check each line against the photo, correct anything misread, then save." />
      <ScanReview
        scanId={scan.id}
        status={scan.status}
        savedCount={scan._count.records}
        engine={scan.ocrEngine}
        notice={scan.ocrError}
        sheet={sheet ?? null}
        matchedEmployeeId={matched?.id ?? ""}
        employees={employees}
        fields={fields}
      />
    </>
  );
}
