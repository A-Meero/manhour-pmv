"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";
import { api, displayDate, errorMessage, formatHours } from "@/lib/client";
import { Alert, Modal, SOURCE_LABEL } from "@/components/ui";
import { JobCardInput } from "@/components/job-card-input";
import { CustomFieldInputs, formatFieldValue, type ClientField, type FieldValues } from "@/components/custom-field-inputs";

type Row = {
  id: string;
  employeeId: string;
  fileNo: string;
  employeeName: string;
  jobTitle: string;
  supervisorName: string;
  jobCard: string;
  startDate: string;
  endDate: string;
  hours: number;
  remarks: string;
  customFields: FieldValues;
  preparedByName: string;
  preparedByDate: string;
  approvedByName: string;
  approvedByDate: string;
  source: string;
  scanId: string | null;
  createdBy: string;
  createdAt: string;
};

type Filters = { q: string; employeeId: string; jobCard: string; from: string; to: string; source: string };

export function RecordsTable({
  records,
  employees,
  fields,
  filters,
  canEdit,
  canDelete,
  total,
  totalHours,
}: {
  records: Row[];
  employees: { id: string; fileNo: string; name: string }[];
  fields: ClientField[];
  filters: Filters;
  canEdit: boolean;
  canDelete: boolean;
  total: number;
  totalHours: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const exportQuery = new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString();

  async function remove(record: Row) {
    if (!confirm(`Delete the record of ${record.employeeName} on job card ${record.jobCard}? The job card becomes open again for this employee.`)) return;
    try {
      await api(`/api/records/${record.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <form action="/records" className="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-6">
        <input name="q" defaultValue={filters.q} placeholder="Search name, file no., job card, remarks" className="input lg:col-span-2" />
        <select name="employeeId" defaultValue={filters.employeeId} className="input">
          <option value="">All employees</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>{employee.fileNo} – {employee.name}</option>
          ))}
        </select>
        <input name="jobCard" defaultValue={filters.jobCard} placeholder="Job card" className="input" />
        <select name="source" defaultValue={filters.source} className="input">
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <div className="flex gap-2 lg:col-span-1">
          <input type="date" name="from" defaultValue={filters.from} className="input" aria-label="From" title="From" />
          <input type="date" name="to" defaultValue={filters.to} className="input" aria-label="To" title="To" />
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
          <a href="/records" className="btn">Clear</a>
          <button className="btn btn-primary">Filter</button>
          <a href={`/api/records/export${exportQuery ? `?${exportQuery}` : ""}`} className="btn">
            <Download className="h-4 w-4" /> Excel
          </a>
        </div>
      </form>

      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        <span>
          <b className="text-gray-900">{total}</b> record(s)
        </span>
        <span>
          <b className="text-gray-900">{formatHours(Math.round(totalHours * 100) / 100)}</b> hours
        </span>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Phone: cards */}
      <div className="space-y-2 md:hidden">
        {records.length === 0 && <p className="card p-6 text-center text-sm text-gray-500">No records found.</p>}
        {records.map((record) => (
          <div key={record.id} className="card p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{record.employeeName}</p>
                <p className="text-xs text-gray-500">{record.fileNo}</p>
              </div>
              <span className="text-lg font-bold text-brand">{formatHours(record.hours)}h</span>
            </div>
            <p className="mt-1 font-mono">{record.jobCard}</p>
            <p className="text-gray-600">
              {displayDate(record.startDate)}
              {record.endDate !== record.startDate && ` – ${displayDate(record.endDate)}`}
            </p>
            {record.remarks && <p className="mt-1 text-gray-600">{record.remarks}</p>}
            <Actions record={record} canEdit={canEdit} canDelete={canDelete} onEdit={setEditing} onDelete={remove} />
          </div>
        ))}
      </div>

      {/* Tablet/desktop: table */}
      <div className="table-wrap hidden md:block">
        <table className="table">
          <thead>
            <tr>
              <th>File No.</th>
              <th>Employee</th>
              <th>Job Card</th>
              <th>Start</th>
              <th>End</th>
              <th className="text-right">Hours</th>
              <th>Remarks</th>
              {fields.map((field) => (
                <th key={field.id}>{field.label}</th>
              ))}
              <th>Supervisor</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={10 + fields.length} className="py-8 text-center text-gray-500">No records found.</td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id}>
                <td className="font-mono">{record.fileNo}</td>
                <td className="whitespace-nowrap">{record.employeeName}</td>
                <td className="font-mono font-semibold">{record.jobCard}</td>
                <td className="whitespace-nowrap">{displayDate(record.startDate)}</td>
                <td className="whitespace-nowrap">{displayDate(record.endDate)}</td>
                <td className="text-right font-semibold">{formatHours(record.hours)}</td>
                <td className="max-w-56">{record.remarks}</td>
                {fields.map((field) => (
                  <td key={field.id}>{formatFieldValue(field, record.customFields[field.key])}</td>
                ))}
                <td className="whitespace-nowrap">{record.supervisorName}</td>
                <td title={`Entered by ${record.createdBy} on ${new Date(record.createdAt).toLocaleString()}`}>{SOURCE_LABEL[record.source] ?? record.source}</td>
                <td>
                  <Actions record={record} canEdit={canEdit} canDelete={canDelete} onEdit={setEditing} onDelete={remove} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EditRecord record={editing} employees={employees} fields={fields} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}

function Actions({
  record,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  record: Row;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (record: Row) => void;
  onDelete: (record: Row) => void;
}) {
  return (
    <div className="mt-2 flex justify-end gap-1 md:mt-0">
      {record.scanId && (
        <a className="btn btn-sm" href={`/api/scans/${record.scanId}/image`} target="_blank" rel="noreferrer" title="View photographed sheet">
          <ImageIcon className="h-3.5 w-3.5" />
        </a>
      )}
      {canEdit && (
        <button className="btn btn-sm" onClick={() => onEdit(record)} aria-label="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canDelete && (
        <button className="btn btn-sm btn-danger" onClick={() => onDelete(record)} aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function EditRecord({
  record,
  employees,
  fields,
  onClose,
  onSaved,
}: {
  record: Row;
  employees: { id: string; fileNo: string; name: string }[];
  fields: ClientField[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    employeeId: record.employeeId,
    jobCardCode: record.jobCard,
    startDate: record.startDate,
    endDate: record.endDate,
    hours: String(record.hours),
    remarks: record.remarks,
    preparedByName: record.preparedByName,
    preparedByDate: record.preparedByDate,
    approvedByName: record.approvedByName,
    approvedByDate: record.approvedByDate,
  });
  const [values, setValues] = useState<FieldValues>(record.customFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/records/${record.id}`, { method: "PATCH", body: { ...form, customFields: values } });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit record" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Employee</label>
            <select className="input" value={form.employeeId} onChange={(e) => set({ employeeId: e.target.value })}>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.fileNo} – {employee.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Job card</label>
            <JobCardInput value={form.jobCardCode} onChange={(value) => set({ jobCardCode: value })} />
          </div>
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </div>
          <div>
            <label className="label">End date</label>
            <input type="date" className="input" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Hours worked</label>
            <input type="number" step="0.25" min="0" className="input" value={form.hours} onChange={(e) => set({ hours: e.target.value })} />
          </div>
          <div>
            <label className="label">Remarks</label>
            <input className="input" value={form.remarks} onChange={(e) => set({ remarks: e.target.value })} />
          </div>
        </div>
        <CustomFieldInputs fields={fields} values={values} onChange={setValues} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="label">Prepared by</label>
              <input className="input" value={form.preparedByName} onChange={(e) => set({ preparedByName: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.preparedByDate} onChange={(e) => set({ preparedByDate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div>
              <label className="label">Approved by</label>
              <input className="input" value={form.approvedByName} onChange={(e) => set({ approvedByName: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" className="input" value={form.approvedByDate} onChange={(e) => set({ approvedByDate: e.target.value })} />
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500">Entered by {record.createdBy || "—"} ({SOURCE_LABEL[record.source]}) on {new Date(record.createdAt).toLocaleString()}.</p>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
