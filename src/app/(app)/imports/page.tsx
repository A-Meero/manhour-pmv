import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canEnterRecords, canManageMasterData, isAdmin } from "@/lib/auth/access";
import { PageHeader, SOURCE_LABEL } from "@/components/ui";

const KIND_LABEL = { JOB_CARDS: "Job cards", EMPLOYEES: "Employees", RECORDS: "Records" } as const;

export default async function ImportsPage() {
  const user = await requirePage((u) => canManageMasterData(u) || canEnterRecords(u));
  const batches = await prisma.importBatch.findMany({
    where: isAdmin(user) ? {} : { createdById: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { createdBy: { select: { name: true } }, apiKey: { select: { name: true } } },
  });
  return (
    <>
      <PageHeader title={isAdmin(user) ? "Import History" : "My Imports"} description="Excel and API imports with their reports of skipped and invalid rows." />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Source</th>
              <th>File / key</th>
              <th>By</th>
              <th>Rows</th>
              <th>Imported</th>
              <th>Skipped</th>
              <th>Invalid</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-gray-500">No imports yet.</td>
              </tr>
            )}
            {batches.map((batch) => (
              <tr key={batch.id}>
                <td className="whitespace-nowrap">{batch.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Kuwait" })}</td>
                <td>{KIND_LABEL[batch.kind]}</td>
                <td>{SOURCE_LABEL[batch.source] ?? batch.source}</td>
                <td className="max-w-48 truncate">{batch.fileName}</td>
                <td>{batch.createdBy?.name ?? batch.apiKey?.name ?? ""}</td>
                <td>{batch.totalRows}</td>
                <td className="font-semibold text-green-700">{batch.created}</td>
                <td>{batch.skipped}</td>
                <td className={batch.failed ? "font-semibold text-red-700" : ""}>{batch.failed}</td>
                <td>
                  {batch.skipped + batch.failed > 0 && (
                    <a className="btn btn-sm" href={`/api/imports/${batch.id}/report`}>Report</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
