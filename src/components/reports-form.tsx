"use client";

import { useState } from "react";
import { Download } from "lucide-react";

type Report = { kind: string; label: string; hint: string };

/** Pick a period, then download any report as Excel. */
export function ReportsForm({ reports, defaultFrom, defaultTo }: { reports: Report[]; defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const valid = !!from && !!to && from <= to;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="report-from">From</label>
          <input id="report-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="report-to">To</label>
          <input id="report-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {!valid && <p className="text-sm text-red-700">Choose a From date on or before the To date.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {reports.map((report) => (
          <div key={report.kind} className="card flex flex-col justify-between gap-3 p-4">
            <div>
              <h2 className="font-semibold">{report.label}</h2>
              <p className="text-sm text-gray-600">{report.hint}</p>
            </div>
            <a
              className={`btn w-fit ${valid ? "" : "pointer-events-none opacity-50"}`}
              href={`/api/reports/${report.kind}?from=${from}&to=${to}`}
              download
              aria-disabled={!valid}
            >
              <Download className="h-4 w-4" /> Download Excel
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
