import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { buildSheet, xlsxResponse } from "@/lib/excel";
import type { ImportIssue } from "@/lib/masterdata";

type Ctx = { params: Promise<{ id: string }> };

/** Excel report of the skipped/invalid rows of an import. */
export const GET = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({ where: { id } });
  if (!batch) throw new HttpError(404, "Import not found.");
  if (!isAdmin(user) && batch.createdById !== user.id) throw new HttpError(403, "You can only download your own import reports.");
  const issues = (batch.issues ?? []) as unknown as ImportIssue[];
  const data = await buildSheet(
    "Report",
    [
      { header: "Row", key: "row", width: 8 },
      { header: "Value", key: "value", width: 34 },
      { header: "Status", key: "status", width: 10 },
      { header: "Reason", key: "reason", width: 80 },
    ],
    issues.map((issue) => ({ ...issue })),
  );
  return xlsxResponse(data, `import-report-${batch.kind.toLowerCase()}-${batch.createdAt.toISOString().slice(0, 10)}.xlsx`);
});
