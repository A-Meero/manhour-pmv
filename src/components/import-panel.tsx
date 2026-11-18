"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";

type Issue = { row: number; value: string; reason: string; status: "skipped" | "failed" };
type Summary = { batchId: string | null; totalRows: number; created: number; skipped: number; failed: number; issues: Issue[] };

/** Upload an Excel file, then show what was imported and which rows were skipped or invalid. */
export function ImportPanel({
  endpoint,
  templateUrl,
  description,
  onImported,
}: {
  endpoint: string;
  templateUrl: string;
  description?: string;
  onImported?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api<Summary>(endpoint, { body: form });
      setSummary(result);
      setFile(null);
      if (input.current) input.current.value = "";
      onImported?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {description && <p className="text-sm text-gray-600">{description}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <a href={templateUrl} className="btn">
          <Download className="h-4 w-4" /> Download template
        </a>
        <input
          ref={input}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium sm:w-auto"
        />
        <button className="btn btn-primary" onClick={upload} disabled={!file || busy}>
          <Upload className="h-4 w-4" /> {busy ? "Importing…" : "Import"}
        </button>
      </div>
      {error && <Alert>{error}</Alert>}
      {summary && (
        <div className="space-y-2">
          <Alert kind={summary.failed ? "warning" : "success"}>
            {summary.totalRows} row(s) read · <b>{summary.created} imported</b> · {summary.skipped} skipped · {summary.failed} invalid
          </Alert>
          {summary.issues.length > 0 && (
            <>
              <div className="table-wrap max-h-72 overflow-y-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Value</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.issues.map((issue, index) => (
                      <tr key={index}>
                        <td>{issue.row}</td>
                        <td className="whitespace-nowrap">{issue.value}</td>
                        <td>
                          <span className={`badge ${issue.status === "failed" ? "bg-red-100 text-red-800" : "bg-gray-200 text-gray-700"}`}>
                            {issue.status === "failed" ? "Invalid" : "Skipped"}
                          </span>
                        </td>
                        <td>{issue.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {summary.batchId && (
                <a href={`/api/imports/${summary.batchId}/report`} className="btn btn-sm">
                  <Download className="h-3.5 w-3.5" /> Download report
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
