import Link from "next/link";
import { Printer } from "lucide-react";
import { requireMethodPage } from "@/lib/auth/guards";
import { getEntryData } from "@/lib/entry-data";
import { PageHeader } from "@/components/ui";
import { RecordEntry } from "@/components/record-entry";
import { getSettings } from "@/lib/settings";
import { methodAllowed } from "@/lib/auth/access";

export default async function NewRecordPage() {
  const user = await requireMethodPage("manual");
  const [{ employees, fields }, settings] = await Promise.all([getEntryData(user), getSettings()]);
  const only = employees.length === 1 ? employees[0].id : "";
  const limits = [
    settings.dailyHourLimit !== null ? `${settings.dailyHourLimit}h per day` : "",
    settings.weeklyHourLimit !== null ? `${settings.weeklyHourLimit}h per week` : "",
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="New entry"
        description={`One line per job card. A job card can be recorded once per employee.${limits.length ? ` Limits: ${limits.join(", ")}.` : ""}`}
        actions={
          <>
            {methodAllowed(user, settings.methods, "photo") && <Link href="/records/scan" className="btn">Scan a sheet instead</Link>}
            <a href="/api/templates/sheet-pdf" target="_blank" className="btn">
              <Printer className="h-4 w-4" /> Blank sheet (PDF)
            </a>
          </>
        }
      />
      {employees.length === 0 ? (
        <p className="card p-6 text-sm text-gray-600">There are no active employees you can enter records for.</p>
      ) : (
        <RecordEntry
          employees={employees}
          fields={fields}
          submitUrl="/api/records"
          initial={{ employeeId: only, preparedByName: "", preparedByDate: "", approvedByName: "", approvedByDate: "", rows: [] }}
        />
      )}
    </>
  );
}
