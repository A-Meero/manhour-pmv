"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Printer, QrCode, Trash2, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal, SOURCE_LABEL, StatusBadge } from "@/components/ui";
import { ImportPanel } from "@/components/import-panel";
import { CustomFieldInputs, formatFieldValue, type ClientField, type FieldValues } from "@/components/custom-field-inputs";

type Card = {
  id: string;
  code: string;
  active: boolean;
  status: "OPEN" | "CLOSED";
  closedAt: string | null;
  source: string;
  customFields: FieldValues;
  records: number;
  /** records + sessions + issued parts: the card can no longer be deleted */
  inUse: number;
  createdAt: string;
};

type Summary = { created: number; skipped: number; failed: number; issues: { value: string; reason: string }[] };

export function JobCardsManager({
  cards,
  fields,
  filters,
  canManage,
}: {
  cards: Card[];
  fields: ClientField[];
  filters: { q: string; status: string };
  canManage: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "import" | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [error, setError] = useState("");

  async function toggle(card: Card) {
    setError("");
    try {
      await api(`/api/job-cards/${card.id}`, { method: "PATCH", body: { active: !card.active } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(card: Card) {
    if (!confirm(`Delete job card ${card.code}? This cannot be undone.`)) return;
    setError("");
    try {
      await api(`/api/job-cards/${card.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <form className="flex flex-1 flex-col gap-2 sm:flex-row" action="/job-cards">
          <input name="q" defaultValue={filters.q} placeholder="Search job card ID" className="input sm:max-w-xs" />
          <select name="status" defaultValue={filters.status} className="input sm:w-40">
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="btn">Search</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href="/api/templates/qr-labels?status=open" target="_blank" title="QR labels for every open, active job card">
            <Printer className="h-4 w-4" /> QR labels (open cards)
          </a>
          {canManage && (
            <>
              <button className="btn" onClick={() => setMode("import")}>
                <Upload className="h-4 w-4" /> Import Excel
              </button>
              <button className="btn btn-primary" onClick={() => setMode("add")}>
                <Plus className="h-4 w-4" /> Add
              </button>
            </>
          )}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Job Card ID</th>
              {fields.map((field) => (
                <th key={field.id}>{field.label}</th>
              ))}
              <th>Records</th>
              <th>Source</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cards.length === 0 && (
              <tr>
                <td colSpan={5 + fields.length} className="py-8 text-center text-gray-500">No job cards found.</td>
              </tr>
            )}
            {cards.map((card) => (
              <tr key={card.id}>
                <td className="font-mono font-semibold">
                  <Link href={`/job-cards/${card.id}`} className="text-brand hover:underline">{card.code}</Link>
                </td>
                {fields.map((field) => (
                  <td key={field.id}>{formatFieldValue(field, card.customFields[field.key])}</td>
                ))}
                <td>{card.records}</td>
                <td>{SOURCE_LABEL[card.source] ?? card.source}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {card.status === "CLOSED" ? (
                      <span className="badge bg-gray-800 text-white" title={card.closedAt ? `Closed ${new Date(card.closedAt).toLocaleString("en-GB")}` : undefined}>Closed</span>
                    ) : (
                      <span className="badge bg-blue-100 text-blue-800">Open</span>
                    )}
                    {!card.active && <StatusBadge active={false} />}
                  </div>
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <a className="btn btn-sm" href={`/api/templates/qr-labels?ids=${card.id}`} target="_blank" aria-label="Print QR label" title="Print QR label">
                      <QrCode className="h-3.5 w-3.5" />
                    </a>
                    {canManage && (
                      <>
                    <button className="btn btn-sm" onClick={() => setEditing(card)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="btn btn-sm" onClick={() => toggle(card)}>{card.active ? "Deactivate" : "Activate"}</button>
                    {card.inUse === 0 && (
                      <button className="btn btn-sm btn-danger" onClick={() => remove(card)} aria-label="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === "add" && <AddJobCards fields={fields} onClose={() => setMode(null)} onSaved={() => router.refresh()} />}
      {mode === "import" && (
        <Modal title="Import job cards from Excel" onClose={() => setMode(null)} wide>
          <ImportPanel
            endpoint="/api/job-cards/import"
            templateUrl="/api/templates/job-cards"
            description="Fill the template's Data sheet with one job card ID per row. IDs that already exist are skipped."
            onImported={() => router.refresh()}
          />
        </Modal>
      )}
      {editing && <EditJobCard card={editing} fields={fields} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
    </div>
  );
}

function AddJobCards({ fields, onClose, onSaved }: { fields: ClientField[]; onClose: () => void; onSaved: () => void }) {
  const [codes, setCodes] = useState("");
  const [values, setValues] = useState<FieldValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Summary | null>(null);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const summary = await api<Summary>("/api/job-cards", { body: { codes, customFields: values } });
      setResult(summary);
      if (summary.created) {
        setCodes("");
        onSaved();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add job cards" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Job card IDs</label>
          <textarea className="input min-h-32 font-mono" value={codes} onChange={(e) => setCodes(e.target.value)} placeholder={"One ID per line\nJC-1001\nJC-1002"} />
          <p className="mt-1 text-xs text-gray-500">IDs are saved in upper case. Existing IDs are skipped.</p>
        </div>
        {fields.length > 0 && (
          <>
            <p className="text-xs text-gray-500">These values apply to every ID you add above.</p>
            <CustomFieldInputs fields={fields} values={values} onChange={setValues} />
          </>
        )}
        {error && <Alert>{error}</Alert>}
        {result && (
          <Alert kind={result.failed || result.skipped ? "warning" : "success"}>
            {result.created} added, {result.skipped} skipped, {result.failed} invalid
            {result.issues.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {result.issues.slice(0, 20).map((issue, index) => (
                  <li key={index}>
                    {issue.value || "(empty)"}: {issue.reason}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !codes.trim()}>{busy ? "Saving…" : "Add"}</button>
        </div>
      </div>
    </Modal>
  );
}

function EditJobCard({ card, fields, onClose, onSaved }: { card: Card; fields: ClientField[]; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(card.code);
  const [values, setValues] = useState<FieldValues>(card.customFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/job-cards/${card.id}`, { method: "PATCH", body: { code, customFields: values } });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${card.code}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Job card ID</label>
          <input className="input font-mono" value={code} onChange={(e) => setCode(e.target.value)} />
          {card.records > 0 && <p className="mt-1 text-xs text-amber-700">Used by {card.records} record(s); they will show the new ID.</p>}
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
