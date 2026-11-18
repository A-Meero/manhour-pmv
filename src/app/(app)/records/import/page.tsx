import { requirePage } from "@/lib/auth/guards";
import { canEnterRecords, isManagerOrAdmin } from "@/lib/auth/access";
import { PageHeader } from "@/components/ui";
import { RecordsImport } from "@/components/records-import";

export default async function ImportRecordsPage() {
  const user = await requirePage(canEnterRecords);
  return (
    <>
      <PageHeader title="Import records from Excel" description="Each row is one job for one employee with a start and end date." />
      <div className="card space-y-3 p-5">
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>Download the template and fill the <b>Data</b> sheet (one row per employee + job card).</li>
          <li>Employees and job cards must already exist. A job card can be recorded once per employee.</li>
          {!isManagerOrAdmin(user) && <li>You can only import records for the employees you supervise{user.canEnterOwnRecords ? " and yourself" : ""}.</li>}
          <li>Valid rows are imported; you get a report of the invalid ones.</li>
        </ul>
        <RecordsImport />
      </div>
    </>
  );
}
