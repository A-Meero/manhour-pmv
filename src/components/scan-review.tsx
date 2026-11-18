"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";
import { RecordEntry, newRow, toDateInput, type EmployeeOption, type EntryInitial } from "@/components/record-entry";
import type { ClientField } from "@/components/custom-field-inputs";

type Sheet = {
  employeeFileNo: string;
  employeeName: string;
  preparedByName: string;
  preparedByDate: string;
  approvedByName: string;
  approvedByDate: string;
  rows: { jobCardNo: string; startDate: string; endDate: string; hours: string; remarks: string }[];
};

export function ScanReview({
  scanId,
  status,
  savedCount,
  engine,
  notice,
  sheet,
  matchedEmployeeId,
  employees,
  fields,
}: {
  scanId: string;
  status: string;
  savedCount: number;
  engine: string;
  notice: string;
  sheet: Sheet | null;
  matchedEmployeeId: string;
  employees: EmployeeOption[];
  fields: ClientField[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");

  const { initial, notes } = useMemo(() => {
    const notes: Record<string, string> = {};
    const rows = (sheet?.rows ?? []).map((row) => {
      const startDate = toDateInput(row.startDate);
      const endDate = toDateInput(row.endDate || row.startDate);
      const hours = row.hours.replace(",", ".").replace(/[^0-9.]/g, "");
      const entry = newRow({ jobCardCode: row.jobCardNo.toUpperCase(), startDate, endDate, hours, remarks: row.remarks });
      const unread = [
        row.startDate && !startDate ? `start "${row.startDate}"` : "",
        row.endDate && !endDate ? `end "${row.endDate}"` : "",
        row.hours && hours !== row.hours.trim() ? `hours "${row.hours}"` : "",
      ].filter(Boolean);
      if (unread.length) notes[entry.key] = unread.join(", ");
      return entry;
    });
    if (sheet && !matchedEmployeeId && (sheet.employeeFileNo || sheet.employeeName)) {
      notes.employee = [sheet.employeeFileNo, sheet.employeeName].filter(Boolean).join(" – ");
    }
    const initial: EntryInitial = {
      employeeId: matchedEmployeeId,
      preparedByName: sheet?.preparedByName ?? "",
      preparedByDate: toDateInput(sheet?.preparedByDate ?? ""),
      approvedByName: sheet?.approvedByName ?? "",
      approvedByDate: toDateInput(sheet?.approvedByDate ?? ""),
      rows,
    };
    return { initial, notes };
  }, [sheet, matchedEmployeeId]);

  async function discard() {
    if (!confirm("Discard this scan? Nothing more will be saved from it.")) return;
    try {
      await api(`/api/scans/${scanId}`, { method: "DELETE" });
      router.push("/records/scan");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const imageUrl = `/api/scans/${scanId}/image`;
  const done = status !== "PENDING_REVIEW";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="card overflow-hidden">
          <a href={imageUrl} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Photographed sheet" className="max-h-[75vh] w-full object-contain" />
          </a>
          <div className="flex items-center justify-between border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
            <span>Read with: {engine === "tesseract" ? "Tesseract (offline)" : engine === "claude" ? "Claude" : engine || "—"}</span>
            <a href={imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand">
              Full size <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {notice && <Alert kind="warning">{notice}</Alert>}
        {savedCount > 0 && <Alert kind="info">{savedCount} record(s) from this sheet are already saved.</Alert>}
        {error && <Alert>{error}</Alert>}
        {done ? (
          <Alert kind="info">This scan is {status === "SAVED" ? "fully saved" : "discarded"}.</Alert>
        ) : (
          <>
            {initial.rows.length === 0 && <Alert kind="warning">No lines could be read from the photo. Type them in below.</Alert>}
            <RecordEntry
              employees={employees}
              fields={fields}
              submitUrl={`/api/scans/${scanId}/save`}
              initial={initial}
              unreadNotes={notes}
              onAllSaved={() => router.push("/records?source=PHOTO")}
            />
            <button className="btn btn-danger" onClick={discard}>Discard scan</button>
          </>
        )}
      </div>
    </div>
  );
}
