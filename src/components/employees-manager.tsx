"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Printer, Trash2, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal, StatusBadge } from "@/components/ui";
import { ImportPanel } from "@/components/import-panel";
import { CustomFieldInputs, formatFieldValue, type ClientField, type FieldValues } from "@/components/custom-field-inputs";
import { SupervisorPicker, type PickUser } from "@/components/supervisor-picker";

type Employee = {
  id: string;
  fileNo: string;
  name: string;
  jobTitle: string;
  hourlyRate: number;
  active: boolean;
  source: string;
  customFields: FieldValues;
  supervisors: { id: string; name: string }[];
  login: string | null;
  records: number;
};

export function EmployeesManager({
  employees,
  users,
  fields,
  filters,
}: {
  employees: Employee[];
  users: PickUser[];
  fields: ClientField[];
  filters: { q: string; status: string; supervisorId: string };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  async function toggle(employee: Employee) {
    setError("");
    try {
      await api(`/api/employees/${employee.id}`, { method: "PATCH", body: { active: !employee.active } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(employee: Employee) {
    if (!confirm(`Delete employee ${employee.fileNo} – ${employee.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/employees/${employee.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form className="flex flex-1 flex-col gap-2 sm:flex-row" action="/employees">
          <input name="q" defaultValue={filters.q} placeholder="Search name, file no., job title" className="input sm:max-w-xs" />
          <select name="supervisorId" defaultValue={filters.supervisorId} className="input sm:w-48">
            <option value="">All supervisors</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
          <select name="status" defaultValue={filters.status} className="input sm:w-32">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="btn">Search</button>
        </form>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setImporting(true)}>
            <Upload className="h-4 w-4" /> Import Excel
          </button>
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>File No.</th>
              <th>Name</th>
              <th>Job Title</th>
              <th className="text-right">Rate / h</th>
              <th>Supervisors</th>
              {fields.map((field) => (
                <th key={field.id}>{field.label}</th>
              ))}
              <th>Records</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr>
                <td colSpan={8 + fields.length} className="py-8 text-center text-gray-500">No employees found.</td>
              </tr>
            )}
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td className="font-mono font-semibold">{employee.fileNo}</td>
                <td>
                  {employee.name}
                  {employee.login && <div className="text-xs text-gray-500">Login: {employee.login}</div>}
                </td>
                <td>{employee.jobTitle}</td>
                <td className="text-right">{employee.hourlyRate ? employee.hourlyRate.toFixed(3) : <span className="text-gray-400">—</span>}</td>
                <td>{employee.supervisors.map((s) => s.name).join(", ") || <span className="text-gray-400">—</span>}</td>
                {fields.map((field) => (
                  <td key={field.id}>{formatFieldValue(field, employee.customFields[field.key])}</td>
                ))}
                <td>{employee.records}</td>
                <td>
                  <StatusBadge active={employee.active} />
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <a className="btn btn-sm" href={`/api/templates/sheet-pdf?employeeId=${employee.id}`} target="_blank" title="Print sheet for this employee">
                      <Printer className="h-3.5 w-3.5" />
                    </a>
                    <button className="btn btn-sm" onClick={() => setEditing(employee)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="btn btn-sm" onClick={() => toggle(employee)}>{employee.active ? "Deactivate" : "Activate"}</button>
                    {employee.records === 0 && (
                      <button className="btn btn-sm btn-danger" onClick={() => remove(employee)} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {importing && (
        <Modal title="Import employees from Excel" onClose={() => setImporting(false)} wide>
          <ImportPanel
            endpoint="/api/employees/import"
            templateUrl="/api/templates/employees"
            description="One employee per row. Existing file numbers are skipped. Supervisors are matched by their login email."
            onImported={() => router.refresh()}
          />
        </Modal>
      )}
      {editing && (
        <EmployeeForm
          employee={editing === "new" ? null : editing}
          users={users}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function EmployeeForm({
  employee,
  users,
  fields,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  users: PickUser[];
  fields: ClientField[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fileNo, setFileNo] = useState(employee?.fileNo ?? "");
  const [name, setName] = useState(employee?.name ?? "");
  const [jobTitle, setJobTitle] = useState(employee?.jobTitle ?? "");
  const [hourlyRate, setHourlyRate] = useState(employee?.hourlyRate ? String(employee.hourlyRate) : "");
  const [supervisorIds, setSupervisorIds] = useState<string[]>(employee?.supervisors.map((s) => s.id) ?? []);
  const [values, setValues] = useState<FieldValues>(employee?.customFields ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const body = { fileNo, name, jobTitle, hourlyRate, supervisorIds, customFields: values };
    try {
      if (employee) await api(`/api/employees/${employee.id}`, { method: "PATCH", body });
      else await api("/api/employees", { body });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={employee ? `Edit ${employee.name}` : "Add employee"} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">File No. *</label>
            <input className="input font-mono" value={fileNo} onChange={(e) => setFileNo(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Name *</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Job Title</label>
            <input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">Hourly rate (KWD)</label>
            <input className="input" type="number" min="0" step="0.001" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="0.000" />
          </div>
        </div>
        <div>
          <label className="label">Supervisors</label>
          <SupervisorPicker users={users} value={supervisorIds} onChange={setSupervisorIds} />
        </div>
        <CustomFieldInputs fields={fields} values={values} onChange={setValues} />
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
