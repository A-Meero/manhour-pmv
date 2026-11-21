"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal, StatusBadge } from "@/components/ui";
import { ImportPanel } from "@/components/import-panel";
import { formatMoney } from "@/lib/money";

export type AssetForm = {
  id: string;
  code: string;
  description: string;
  category: string;
  location: string;
  make: string;
  model: string;
  serialNo: string;
  chassisNo: string;
  plateNo: string;
  yearOfMake: number | null;
  /** YYYY-MM-DD */
  purchaseDate: string;
  purchaseValue: number | null;
  depreciationRate: number | null;
  notes: string;
  active: boolean;
};

export type AssetRow = AssetForm & {
  openJobCard: { id: string; code: string } | null;
  jobCards: number;
  maintenance: number | null;
  bookValue: number | null;
};

export function AssetsManager({
  assets,
  filters,
  categories,
  locations,
  canManage,
  showCosts,
}: {
  assets: AssetRow[];
  filters: { q: string; category: string; location: string; show: string };
  categories: string[];
  locations: string[];
  canManage: boolean;
  showCosts: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "import" | null>(null);
  const [editing, setEditing] = useState<AssetRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap" action="/assets">
          <input name="q" defaultValue={filters.q} placeholder="Code, description, plate, chassis" className="input sm:max-w-xs" />
          <select name="category" defaultValue={filters.category} className="input sm:w-40">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select name="location" defaultValue={filters.location} className="input sm:w-44">
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <select name="show" defaultValue={filters.show} className="input sm:w-40">
            <option value="active">Active</option>
            <option value="open">With an open job card</option>
            <option value="all">All</option>
          </select>
          <button className="btn">Search</button>
        </form>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href="/api/assets/export" download>
            <Download className="h-4 w-4" /> Export
          </a>
          {canManage && (
            <>
              <button className="btn" onClick={() => setMode("import")}>
                <Upload className="h-4 w-4" /> Import Excel
              </button>
              <button className="btn btn-primary" onClick={() => setMode("add")}>
                <Plus className="h-4 w-4" /> Add asset
              </button>
            </>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Category</th>
              <th>Plate</th>
              <th>Location</th>
              <th>Job cards</th>
              {showCosts && <th className="text-right">Maintenance</th>}
              {showCosts && <th className="text-right">Book value</th>}
              <th>Status</th>
              {canManage && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-gray-500">No assets found.</td>
              </tr>
            )}
            {assets.map((asset) => (
              <tr key={asset.id}>
                <td className="font-mono font-semibold">
                  <Link href={`/assets/${asset.id}`} className="text-brand hover:underline">{asset.code}</Link>
                </td>
                <td>{asset.description || <span className="text-gray-400">—</span>}</td>
                <td>{asset.category}</td>
                <td className="font-mono text-xs">{asset.plateNo}</td>
                <td>{asset.location}</td>
                <td>
                  {asset.jobCards}
                  {asset.openJobCard && (
                    <Link href={`/job-cards/${asset.openJobCard.id}`} className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                      Open: {asset.openJobCard.code}
                    </Link>
                  )}
                </td>
                {showCosts && <td className="text-right">{asset.maintenance ? formatMoney(asset.maintenance, false) : "—"}</td>}
                {showCosts && <td className="text-right">{asset.bookValue === null ? "—" : formatMoney(asset.bookValue, false)}</td>}
                <td>
                  <StatusBadge active={asset.active} />
                </td>
                {canManage && (
                  <td className="text-right">
                    <button className="btn btn-sm" onClick={() => setEditing(asset)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(mode === "add" || editing) && (
        <AssetFormModal
          asset={editing ?? undefined}
          showCosts={showCosts}
          onClose={() => {
            setMode(null);
            setEditing(null);
          }}
          onSaved={() => router.refresh()}
        />
      )}
      {mode === "import" && (
        <Modal title="Import assets" onClose={() => setMode(null)}>
          <ImportPanel
            endpoint="/api/assets/import"
            templateUrl="/api/templates/assets"
            description="One asset per row. Existing asset codes are skipped."
            onImported={() => router.refresh()}
          />
        </Modal>
      )}
    </div>
  );
}

const EMPTY: Omit<AssetForm, "id"> = {
  code: "",
  description: "",
  category: "",
  location: "",
  make: "",
  model: "",
  serialNo: "",
  chassisNo: "",
  plateNo: "",
  yearOfMake: null,
  purchaseDate: "",
  purchaseValue: null,
  depreciationRate: null,
  notes: "",
  active: true,
};

/** Add / edit an asset. `initial` pre-fills a new asset (e.g. from a job card photo). */
export function AssetFormModal({
  asset,
  initial,
  showCosts,
  onClose,
  onSaved,
}: {
  asset?: AssetForm;
  initial?: Partial<AssetForm>;
  /** Without "View costs & rates" the purchase / depreciation fields are hidden and left unchanged */
  showCosts: boolean;
  onClose: () => void;
  onSaved: (saved: { id: string; code: string }) => void;
}) {
  const start = asset ?? { ...EMPTY, ...initial };
  const [form, setForm] = useState({
    ...start,
    yearOfMake: start.yearOfMake === null || start.yearOfMake === undefined ? "" : String(start.yearOfMake),
    purchaseValue: start.purchaseValue === null || start.purchaseValue === undefined ? "" : String(start.purchaseValue),
    depreciationRate: start.depreciationRate === null || start.depreciationRate === undefined ? "" : String(start.depreciationRate),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value });

  async function save() {
    setBusy(true);
    setError("");
    try {
      const { purchaseDate, purchaseValue, depreciationRate, ...rest } = form;
      const body = { ...rest, id: undefined, ...(showCosts ? { purchaseDate, purchaseValue, depreciationRate } : {}) };
      if (asset) {
        await api(`/api/assets/${asset.id}`, { method: "PATCH", body });
        onSaved({ id: asset.id, code: form.code });
      } else {
        onSaved(await api<{ id: string; code: string }>("/api/assets", { body }));
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const input = (key: keyof typeof form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`asset-${key}`}>{label}</label>
      <input id={`asset-${key}`} className="input" value={String(form[key] ?? "")} onChange={set(key)} {...extra} />
    </div>
  );

  return (
    <Modal title={asset ? `Edit ${asset.code}` : "Add asset"} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {input("code", "Asset code *", { className: "input font-mono uppercase" })}
          {input("category", "Category", { placeholder: "e.g. SUV, Dump Truck" })}
        </div>
        {input("description", "Description", { placeholder: "e.g. MITSUBISHI PAJERO SPORT SUV" })}
        <div className="grid gap-3 sm:grid-cols-3">
          {input("make", "Make")}
          {input("model", "Model")}
          {input("yearOfMake", "Year of make", { inputMode: "numeric" })}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {input("plateNo", "Plate no.", { className: "input font-mono" })}
          {input("chassisNo", "Chassis no.", { className: "input font-mono" })}
          {input("serialNo", "Serial no.")}
        </div>
        {input("location", "Location / department")}
        {showCosts && (
          <div className="grid gap-3 sm:grid-cols-3">
            {input("purchaseDate", "Purchase date", { type: "date" })}
            {input("purchaseValue", "Purchase value (KWD)", { inputMode: "decimal" })}
            {input("depreciationRate", "Depreciation % / year", { inputMode: "decimal" })}
          </div>
        )}
        <div>
          <label className="label" htmlFor="asset-notes">Notes</label>
          <textarea id="asset-notes" className="input" rows={2} value={form.notes} onChange={set("notes")} />
        </div>
        {asset && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
          </label>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !form.code.trim()}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
