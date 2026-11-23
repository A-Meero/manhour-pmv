"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, PackagePlus, Pencil, Plus, Printer, Scale, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal, StatusBadge } from "@/components/ui";
import { ImportPanel } from "@/components/import-panel";
import { formatMoney, formatQty } from "@/lib/money";

export type PartRow = {
  id: string;
  partNo: string;
  name: string;
  unit: string;
  unitCost: number;
  qtyOnHand: number;
  minQty: number | null;
  active: boolean;
};

const isLow = (part: PartRow) => part.minQty !== null && part.qtyOnHand <= part.minQty;

export function InventoryManager({ parts, filters, totalValue }: { parts: PartRow[]; filters: { q: string; show: string }; totalValue: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "import" | null>(null);
  const [editing, setEditing] = useState<PartRow | null>(null);
  const [stock, setStock] = useState<{ part: PartRow; kind: "RECEIVE" | "ADJUST" } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <form className="flex flex-1 flex-col gap-2 sm:flex-row" action="/inventory">
          <input name="q" defaultValue={filters.q} placeholder="Search part no. or name" className="input sm:max-w-xs" />
          <select name="show" defaultValue={filters.show} className="input sm:w-44">
            <option value="active">Active parts</option>
            <option value="low">Low stock</option>
            <option value="all">All parts</option>
          </select>
          <button className="btn">Search</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <a
            className="btn"
            href={`/api/templates/part-labels${filters.q || filters.show !== "active" ? `?ids=${parts.map((part) => part.id).join(",")}` : ""}`}
            target="_blank"
            rel="noreferrer"
            title="QR labels for the listed parts"
          >
            <Printer className="h-4 w-4" /> Print QR labels
          </a>
          <a className="btn" href="/api/parts/export" download>
            <Download className="h-4 w-4" /> Export
          </a>
          <button className="btn" onClick={() => setMode("import")}>
            <Upload className="h-4 w-4" /> Import Excel
          </button>
          <button className="btn btn-primary" onClick={() => setMode("add")}>
            <Plus className="h-4 w-4" /> Add part
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-600">Stock value of the listed parts: <b>{formatMoney(totalValue)}</b></p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Part no.</th>
              <th>Name</th>
              <th className="text-right">On hand</th>
              <th className="text-right">Unit cost</th>
              <th className="text-right">Value</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {parts.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">No parts found.</td>
              </tr>
            )}
            {parts.map((part) => (
              <tr key={part.id} className={isLow(part) ? "bg-red-50" : ""}>
                <td className="font-mono font-semibold">
                  <Link href={`/inventory/${part.id}`} className="text-brand hover:underline">{part.partNo}</Link>
                </td>
                <td>{part.name}</td>
                <td className={`text-right whitespace-nowrap font-semibold ${isLow(part) ? "text-red-700" : ""}`}>
                  {formatQty(part.qtyOnHand)} {part.unit}
                  {part.minQty !== null && <span className="block text-xs font-normal text-gray-500">low at {formatQty(part.minQty)}</span>}
                </td>
                <td className="text-right">{formatMoney(part.unitCost, false)}</td>
                <td className="text-right">{formatMoney(part.unitCost * part.qtyOnHand, false)}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {isLow(part) && <span className="badge bg-red-100 text-red-800">Low stock</span>}
                    {!part.active && <StatusBadge active={false} />}
                  </div>
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button className="btn btn-sm" onClick={() => setStock({ part, kind: "RECEIVE" })} title="Receive stock">
                      <PackagePlus className="h-3.5 w-3.5" />
                    </button>
                    <button className="btn btn-sm" onClick={() => setStock({ part, kind: "ADJUST" })} title="Adjust after a stock count">
                      <Scale className="h-3.5 w-3.5" />
                    </button>
                    <button className="btn btn-sm" onClick={() => setEditing(part)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mode === "add" && <PartForm onClose={() => setMode(null)} onSaved={() => router.refresh()} />}
      {editing && <PartForm part={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />}
      {stock && <StockForm part={stock.part} kind={stock.kind} onClose={() => setStock(null)} onSaved={() => router.refresh()} />}
      {mode === "import" && (
        <Modal title="Import spare parts from Excel" onClose={() => setMode(null)} wide>
          <ImportPanel
            endpoint="/api/parts/import"
            templateUrl="/api/templates/parts"
            description="One part per row. Existing part numbers are skipped (use Receive / Adjust to change their stock)."
            onImported={() => router.refresh()}
          />
        </Modal>
      )}
    </div>
  );
}

function PartForm({ part, onClose, onSaved }: { part?: PartRow; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState({
    partNo: part?.partNo ?? "",
    name: part?.name ?? "",
    unit: part?.unit ?? "pcs",
    unitCost: part ? String(part.unitCost) : "",
    minQty: part?.minQty === null || part?.minQty === undefined ? "" : String(part.minQty),
    openingQty: "",
    active: part?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues({ ...values, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value });

  async function save() {
    setBusy(true);
    setError("");
    try {
      const { openingQty, ...rest } = values;
      if (part) await api(`/api/parts/${part.id}`, { method: "PATCH", body: rest });
      else await api("/api/parts", { body: { ...rest, openingQty } });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={part ? `Edit ${part.partNo}` : "Add a spare part"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Part no. *</label>
            <input className="input font-mono" value={values.partNo} onChange={set("partNo")} />
          </div>
          <div>
            <label className="label">Unit</label>
            <input className="input" value={values.unit} onChange={set("unit")} placeholder="pcs, ltr, m, kg" />
          </div>
        </div>
        <div>
          <label className="label">Name *</label>
          <input className="input" value={values.name} onChange={set("name")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Unit cost (KWD) *</label>
            <input className="input" type="number" min="0" step="0.001" value={values.unitCost} onChange={set("unitCost")} />
          </div>
          <div>
            <label className="label">Low stock level</label>
            <input className="input" type="number" min="0" step="any" value={values.minQty} onChange={set("minQty")} placeholder="None" />
          </div>
          {!part && (
            <div>
              <label className="label">Opening stock</label>
              <input className="input" type="number" min="0" step="any" value={values.openingQty} onChange={set("openingQty")} placeholder="0" />
            </div>
          )}
        </div>
        {part && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={values.active} onChange={set("active")} /> Active (can be issued)
          </label>
        )}
        {part && <p className="text-xs text-gray-500">Stock is changed with Receive or Adjust, so every change stays in the history.</p>}
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}

function StockForm({ part, kind, onClose, onSaved }: { part: PartRow; kind: "RECEIVE" | "ADJUST"; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(kind === "ADJUST" ? String(part.qtyOnHand) : "");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/parts/${part.id}/stock`, {
        body: kind === "RECEIVE" ? { kind, qty, unitCost: unitCost || undefined, note } : { kind, countedQty: qty, note },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={`${kind === "RECEIVE" ? "Receive" : "Adjust"} ${part.partNo}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          {part.name} · on hand <b>{formatQty(part.qtyOnHand)} {part.unit}</b> · unit cost {formatMoney(part.unitCost)}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">{kind === "RECEIVE" ? "Quantity received" : "Counted quantity"}</label>
            <input className="input" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </div>
          {kind === "RECEIVE" && (
            <div>
              <label className="label">New unit cost (optional)</label>
              <input className="input" type="number" min="0" step="0.001" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder={String(part.unitCost)} />
            </div>
          )}
        </div>
        <div>
          <label className="label">{kind === "RECEIVE" ? "Note (supplier, invoice no.)" : "Reason *"}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {kind === "RECEIVE" && <p className="text-xs text-gray-500">A new unit cost applies to parts issued from now on.</p>}
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !qty}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
