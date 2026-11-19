"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal } from "@/components/ui";

export type SessionRow = {
  id: string;
  employeeId: string;
  employee: string;
  jobCardId: string;
  jobCard: string;
  startedAt: string;
  endedAt: string | null;
  hours: number;
  autoStopped: boolean;
  needsReview: boolean;
  reviewNote: string;
  editedBy: string;
  /** The current user may correct this session */
  canFix: boolean;
};

/** ISO → value for <input type="datetime-local"> in the browser's time zone */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : "");

const show = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const showTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function SessionsTable({
  sessions,
  showJobCard = true,
  showEmployee = true,
  emptyText = "No sessions.",
}: {
  sessions: SessionRow[];
  showJobCard?: boolean;
  showEmployee?: boolean;
  emptyText?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [error, setError] = useState("");

  async function approve(row: SessionRow) {
    setError("");
    try {
      await api(`/api/sessions/${row.id}`, { method: "PATCH", body: { approve: true } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(row: SessionRow) {
    if (!confirm(`Delete this session of ${row.employee} on ${row.jobCard}? Its hours are taken off the record.`)) return;
    setError("");
    try {
      await api(`/api/sessions/${row.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-2">
      {error && <Alert>{error}</Alert>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {showEmployee && <th>Employee</th>}
              {showJobCard && <th>Job card</th>}
              <th>Start</th>
              <th>End</th>
              <th className="text-right">Hours</th>
              <th>Notes</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-500">{emptyText}</td>
              </tr>
            )}
            {sessions.map((row) => (
              <tr key={row.id} className={row.needsReview ? "bg-amber-50" : ""}>
                {showEmployee && <td>{row.employee}</td>}
                {showJobCard && (
                  <td className="font-mono font-semibold">
                    <Link href={`/job-cards/${row.jobCardId}`} className="text-brand hover:underline">{row.jobCard}</Link>
                  </td>
                )}
                <td className="whitespace-nowrap">{show(row.startedAt)}</td>
                <td className="whitespace-nowrap">
                  {row.endedAt ? (new Date(row.endedAt).toDateString() === new Date(row.startedAt).toDateString() ? showTime(row.endedAt) : show(row.endedAt)) : <span className="font-medium text-green-700">running</span>}
                </td>
                <td className="text-right font-semibold">{fmt(row.hours)}</td>
                <td className="max-w-xs text-xs">
                  {row.autoStopped && <span className="badge mr-1 bg-amber-100 text-amber-800">Auto-stopped</span>}
                  {row.needsReview && <span className="badge mr-1 bg-amber-200 text-amber-900">Needs review</span>}
                  <span className="text-gray-600">{row.reviewNote}</span>
                  {row.editedBy && <span className="block text-gray-400">Checked by {row.editedBy}</span>}
                </td>
                <td>
                  {row.canFix && (
                    <div className="flex justify-end gap-1">
                      {row.needsReview && row.endedAt && (
                        <button className="btn btn-sm" onClick={() => approve(row)} title="Times are correct">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button className="btn btn-sm" onClick={() => setEditing(row)} aria-label="Edit times">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => remove(row)} aria-label="Delete session">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <EditSession row={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}

function EditSession({ row, onClose, onSaved }: { row: SessionRow; onClose: () => void; onSaved: () => void }) {
  const [start, setStart] = useState(toLocalInput(row.startedAt));
  const [end, setEnd] = useState(toLocalInput(row.endedAt));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/sessions/${row.id}`, {
        method: "PATCH",
        body: { startedAt: fromLocalInput(start), ...(row.endedAt || end ? { endedAt: fromLocalInput(end) || null } : {}), ...(note ? { note } : {}) },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${row.employee} · ${row.jobCard}`} onClose={onClose}>
      <div className="space-y-3">
        {row.reviewNote && <Alert kind="warning">{row.reviewNote}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Start</label>
            <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">End{row.endedAt ? "" : " (empty = still running)"}</label>
            <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Note</label>
          <input className="input" placeholder="e.g. confirmed with technician" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !start}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

/** Adds a session a technician forgot to scan. */
export function AddSessionButton({ jobCardId, employees }: { jobCardId: string; employees: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/sessions", { body: { employeeId, jobCardId, startedAt: fromLocalInput(start), endedAt: fromLocalInput(end), note } });
      setOpen(false);
      setEmployeeId("");
      setStart("");
      setEnd("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (employees.length === 0) return null;
  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Add missed session
      </button>
      {open && (
        <Modal title="Add a missed session" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <div>
              <label className="label">Employee</label>
              <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Choose…</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Start</label>
                <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <label className="label">End</label>
                <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Note</label>
              <input className="input" placeholder="Why it was added" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy || !employeeId || !start || !end}>{busy ? "Saving…" : "Add"}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
