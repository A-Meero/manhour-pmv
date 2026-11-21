"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal, StatusBadge } from "@/components/ui";
import { DAY_SHORT, describeShift } from "@/lib/shift-info";

export type ShiftRow = { id: string; name: string; startTime: string; endTime: string; days: number[]; active: boolean; employees: number };

/** Settings › Shifts: named working shifts that employees are assigned to. */
export function ShiftSettings({ shifts }: { shifts: ShiftRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ShiftRow | "new" | null>(null);
  const [error, setError] = useState("");

  async function remove(shift: ShiftRow) {
    const note = shift.employees ? ` ${shift.employees} employee(s) will have no shift.` : "";
    if (!confirm(`Delete shift "${shift.name}"?${note}`)) return;
    setError("");
    try {
      await api(`/api/shifts/${shift.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          Assign a shift to each employee on the Employees page. When a technician is still working on a job card after their shift ends (plus the grace
          period in General), the session is stopped at the shift end and their supervisor is emailed.
        </p>
        <button className="btn btn-primary shrink-0" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add shift
        </button>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Hours and days</th>
              <th className="text-right">Employees</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">No shifts yet.</td>
              </tr>
            )}
            {shifts.map((shift) => (
              <tr key={shift.id}>
                <td className="font-medium">{shift.name}</td>
                <td>{describeShift(shift)}</td>
                <td className="text-right">{shift.employees}</td>
                <td>
                  <StatusBadge active={shift.active} />
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button className="btn btn-sm" onClick={() => setEditing(shift)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(shift)} aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <ShiftForm shift={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}

function ShiftForm({ shift, onClose, onSaved }: { shift: ShiftRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(shift?.name ?? "");
  const [startTime, setStartTime] = useState(shift?.startTime ?? "07:00");
  const [endTime, setEndTime] = useState(shift?.endTime ?? "15:00");
  // Default: Saturday to Thursday
  const [days, setDays] = useState<number[]>(shift?.days ?? [6, 0, 1, 2, 3, 4]);
  const [active, setActive] = useState(shift?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const overnight = endTime && startTime && endTime <= startTime;

  async function save() {
    setBusy(true);
    setError("");
    const body = { name, startTime, endTime, days, active };
    try {
      if (shift) await api(`/api/shifts/${shift.id}`, { method: "PATCH", body });
      else await api("/api/shifts", { body });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  // Week shown starting Saturday, the usual first working day.
  const order = [6, 0, 1, 2, 3, 4, 5];
  return (
    <Modal title={shift ? `Edit ${shift.name}` : "Add shift"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Starts</label>
            <input className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="label">Ends</label>
            <input className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        {overnight && <p className="text-xs text-blue-700">Overnight shift: it ends the next day.</p>}
        <div>
          <label className="label">Working days (the day the shift starts)</label>
          <div className="flex flex-wrap gap-1">
            {order.map((day) => {
              const on = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`btn btn-sm ${on ? "btn-primary" : ""}`}
                  aria-pressed={on}
                  onClick={() => setDays(on ? days.filter((d) => d !== day) : [...days, day])}
                >
                  {DAY_SHORT[day]}
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (inactive shifts are not checked)
        </label>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
