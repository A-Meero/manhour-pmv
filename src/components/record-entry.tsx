"use client";

import { useMemo, useState } from "react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { api, errorMessage, formatHours } from "@/lib/client";
import { Alert } from "@/components/ui";
import { JobCardInput } from "@/components/job-card-input";
import { CustomFieldInput, type ClientField, type FieldValues } from "@/components/custom-field-inputs";

export type EmployeeOption = { id: string; fileNo: string; name: string; jobTitle: string; supervisorName: string };

export type EntryRow = {
  key: string;
  jobCardCode: string;
  startDate: string;
  endDate: string;
  hours: string;
  remarks: string;
  customFields: FieldValues;
  errors?: string[];
};

export type EntryInitial = {
  employeeId: string;
  preparedByName: string;
  preparedByDate: string;
  approvedByName: string;
  approvedByDate: string;
  rows: EntryRow[];
};

type SaveResult = { created: number; invalid: { row: number; errors: string[] }[] };

let counter = 0;
export function newRow(partial: Partial<EntryRow> = {}): EntryRow {
  counter += 1;
  return { jobCardCode: "", startDate: "", endDate: "", hours: "", remarks: "", customFields: {}, ...partial, key: `r${Date.now()}_${counter}` };
}

/** Converts DD/MM/YYYY (or YYYY-MM-DD) to the YYYY-MM-DD value a date input needs; "" when unreadable. */
export function toDateInput(value: string): string {
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = text.match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2}|\d{4})$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const month = Number(match[2]);
  const day = Number(match[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const isBlank = (row: EntryRow) => !row.jobCardCode.trim() && !row.hours.trim() && !row.startDate && !row.endDate && !row.remarks.trim();

/**
 * Entry form shaped like the paper sheet: one employee, several job card lines.
 * Valid lines are saved; invalid lines stay on screen with their errors.
 */
export function RecordEntry({
  employees,
  fields,
  submitUrl,
  initial,
  unreadNotes,
  onAllSaved,
}: {
  employees: EmployeeOption[];
  fields: ClientField[];
  submitUrl: string;
  initial: EntryInitial;
  /** Raw values the reader could not convert (shown next to the inputs) */
  unreadNotes?: Record<string, string>;
  onAllSaved?: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(initial.employeeId);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [header, setHeader] = useState({
    preparedByName: initial.preparedByName,
    preparedByDate: initial.preparedByDate,
    approvedByName: initial.approvedByName,
    approvedByDate: initial.approvedByDate,
  });
  const [rows, setRows] = useState<EntryRow[]>(initial.rows.length ? initial.rows : [newRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const employee = employees.find((entry) => entry.id === employeeId) ?? null;
  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase();
    const list = q ? employees.filter((e) => e.name.toLowerCase().includes(q) || e.fileNo.toLowerCase().includes(q)) : employees;
    return employee && !list.includes(employee) ? [employee, ...list] : list;
  }, [employees, employeeQuery, employee]);

  const total = rows.reduce((sum, row) => sum + (Number(row.hours) || 0), 0);

  function update(key: string, patch: Partial<EntryRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch, errors: undefined } : row)));
  }

  function addRow() {
    const last = rows[rows.length - 1];
    setRows([...rows, newRow({ startDate: last?.startDate ?? "", endDate: last?.endDate ?? "" })]);
  }

  async function save() {
    setError("");
    setSuccess("");
    if (!employeeId) {
      setError("Choose the employee first.");
      return;
    }
    const filled = rows.filter((row) => !isBlank(row));
    if (filled.length === 0) {
      setError("Add at least one job card line.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<SaveResult>(submitUrl, {
        body: {
          employeeId,
          ...header,
          rows: filled.map((row, index) => ({
            row: index + 1,
            jobCardCode: row.jobCardCode,
            startDate: row.startDate,
            endDate: row.endDate,
            hours: row.hours,
            remarks: row.remarks,
            customFields: row.customFields,
          })),
        },
      });
      const errorsByRow = new Map(result.invalid.map((entry) => [entry.row, entry.errors]));
      const remaining = filled
        .map((row, index) => ({ ...row, errors: errorsByRow.get(index + 1) }))
        .filter((row) => row.errors);
      setRows(remaining.length ? remaining : [newRow()]);
      if (result.created) setSuccess(`${result.created} record(s) saved.`);
      if (remaining.length) setError(`${remaining.length} line(s) could not be saved. Fix them below and save again.`);
      else onAllSaved?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">Employee *</label>
            {employees.length > 15 && (
              <input className="input mb-2" placeholder="Search name or file no." value={employeeQuery} onChange={(e) => setEmployeeQuery(e.target.value)} />
            )}
            <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">— Choose employee —</option>
              {filteredEmployees.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.fileNo} – {entry.name}
                </option>
              ))}
            </select>
            {unreadNotes?.employee && !employeeId && <p className="mt-1 text-xs text-amber-700">Read on the sheet: {unreadNotes.employee}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="label">Job Title</span>
              <p className="rounded-md bg-gray-50 px-3 py-2">{employee?.jobTitle || "—"}</p>
            </div>
            <div>
              <span className="label">Supervisor</span>
              <p className="rounded-md bg-gray-50 px-3 py-2">{employee?.supervisorName || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Job cards</h2>
          <span className="text-sm text-gray-600">
            Total hours: <b className="text-gray-900">{formatHours(Math.round(total * 100) / 100)}</b>
          </span>
        </div>
        <div className="hidden gap-2 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 lg:grid lg:grid-cols-[2rem_1.4fr_1fr_1fr_0.7fr_1.4fr_auto]">
          <span>No.</span>
          <span>Job Card No.</span>
          <span>Start Date</span>
          <span>End Date</span>
          <span>Hours</span>
          <span>Remarks</span>
          <span />
        </div>
        <div className="space-y-3 lg:space-y-2">
          {rows.map((row, index) => (
            <div key={row.key} className={`rounded-md border p-3 lg:p-2 ${row.errors ? "border-red-300 bg-red-50/40" : "border-gray-200"}`}>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-[2rem_1.4fr_1fr_1fr_0.7fr_1.4fr_auto] lg:items-center">
                <span className="col-span-2 text-xs font-semibold text-gray-500 lg:col-span-1 lg:text-sm">
                  <span className="lg:hidden">Line </span>
                  {index + 1}
                </span>
                <div className="col-span-2 lg:col-span-1">
                  <label className="label lg:hidden">Job Card No.</label>
                  <JobCardInput value={row.jobCardCode} onChange={(value) => update(row.key, { jobCardCode: value })} className="input py-1.5" />
                </div>
                <div>
                  <label className="label lg:hidden">Start Date</label>
                  <input
                    type="date"
                    className="input py-1.5"
                    value={row.startDate}
                    onChange={(e) => update(row.key, { startDate: e.target.value, endDate: row.endDate || e.target.value })}
                  />
                </div>
                <div>
                  <label className="label lg:hidden">End Date</label>
                  <input type="date" className="input py-1.5" value={row.endDate} min={row.startDate || undefined} onChange={(e) => update(row.key, { endDate: e.target.value })} />
                </div>
                <div>
                  <label className="label lg:hidden">Hours</label>
                  <input type="number" inputMode="decimal" step="0.25" min="0" className="input py-1.5" value={row.hours} onChange={(e) => update(row.key, { hours: e.target.value })} />
                </div>
                <div>
                  <label className="label lg:hidden">Remarks</label>
                  <input className="input py-1.5" value={row.remarks} onChange={(e) => update(row.key, { remarks: e.target.value })} />
                </div>
                <div className="col-span-2 flex justify-end gap-1 lg:col-span-1">
                  <button
                    type="button"
                    className="btn btn-sm"
                    title="Duplicate line"
                    onClick={() => setRows((current) => [...current.slice(0, index + 1), newRow({ ...row, jobCardCode: "", errors: undefined }), ...current.slice(index + 1)])}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    title="Remove line"
                    onClick={() => setRows((current) => (current.length > 1 ? current.filter((r) => r.key !== row.key) : [newRow()]))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {fields.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-dashed border-gray-200 pt-2 md:grid-cols-4">
                  {fields.map((field) => (
                    <div key={field.id}>
                      <label className="label">
                        {field.label}
                        {field.required && <span className="text-brand"> *</span>}
                      </label>
                      <CustomFieldInput
                        compact
                        field={field}
                        value={row.customFields[field.key]}
                        onChange={(value) => update(row.key, { customFields: { ...row.customFields, [field.key]: value } })}
                      />
                    </div>
                  ))}
                </div>
              )}
              {unreadNotes?.[row.key] && <p className="mt-1 text-xs text-amber-700">Read on the sheet: {unreadNotes[row.key]}</p>}
              {row.errors && (
                <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                  {row.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-sm mt-3" onClick={addRow}>
          <Plus className="h-3.5 w-3.5" /> Add line
        </button>
      </div>

      <div className="card grid gap-4 p-4 md:grid-cols-2">
        {(
          [
            { title: "Prepared By", name: "preparedByName", date: "preparedByDate" },
            { title: "Approved By", name: "approvedByName", date: "approvedByDate" },
          ] as const
        ).map((who) => (
          <div key={who.title} className="space-y-2">
            <h3 className="text-sm font-semibold">{who.title}</h3>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                className="input"
                placeholder="Name"
                value={header[who.name]}
                onChange={(e) => setHeader({ ...header, [who.name]: e.target.value })}
              />
              <input type="date" className="input" value={header[who.date]} onChange={(e) => setHeader({ ...header, [who.date]: e.target.value })} />
            </div>
          </div>
        ))}
      </div>

      {success && <Alert kind="success">{success}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button className="btn btn-primary w-full sm:w-auto" onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save records"}
        </button>
      </div>
    </div>
  );
}
