"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Save, Search, Trash2, X } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";
import { CustomFieldInputs, type ClientField, type FieldValues } from "@/components/custom-field-inputs";

/** Values of the job card form (strings, dates as YYYY-MM-DD). Shared by "Add job card" and "Edit details". */
export type JobCardValues = {
  code: string;
  assetId: string;
  /** From the printed card, used to find / create the asset */
  assetCode: string;
  description: string;
  plateNo: string;
  chassisNo: string;
  yearOfMake: string;
  previousReading: string;
  currentReading: string;
  dateIn: string;
  dateOut: string;
  jobType: string;
  repairAt: string;
  project: string;
  operatorName: string;
  receivedBy: string;
  createdByName: string;
  tasks: { description: string; fromDate: string }[];
  customFields: FieldValues;
};

type AssetLite = { id: string; code: string; description: string; plateNo: string; chassisNo: string; active: boolean };
type Check = {
  existing: { id: string; code: string } | null;
  asset: (AssetLite & { by: "code" | "plate" | "chassis" | "chosen" }) | null;
  openCard: { id: string; code: string; dateIn: string } | null;
};

const BY_LABEL = { code: "by asset code", plate: "by plate no.", chassis: "by chassis no.", chosen: "chosen" } as const;
const JOB_TYPES = ["Break Down", "Routine Check", "Traffic Passing", "Full Service", "Preventive Maintenance", "Accident Repair"];

export function JobCardForm({
  mode,
  initial,
  jobCardId,
  fields,
  isAdmin,
  photoPath,
  cardStatus,
}: {
  mode: "new" | "edit";
  initial: JobCardValues;
  jobCardId?: string;
  fields: ClientField[];
  isAdmin: boolean;
  /** Stored photo from read-photo (new cards) */
  photoPath?: string;
  cardStatus?: "OPEN" | "CLOSED";
}) {
  const router = useRouter();
  const [v, setV] = useState<JobCardValues>(initial);
  // "auto" = use whatever the check matched; "chosen" = picked by hand; "new" = create from the card; "none" = no asset
  const [assetMode, setAssetMode] = useState<"auto" | "chosen" | "new" | "none">(initial.assetId ? "chosen" : "auto");
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  const [allowSecondOpen, setAllowSecondOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newAsset, setNewAsset] = useState({
    code: initial.assetCode,
    description: initial.description,
    plateNo: initial.plateNo,
    chassisNo: initial.chassisNo,
    yearOfMake: initial.yearOfMake,
  });

  const set = <K extends keyof JobCardValues>(key: K, value: JobCardValues[K]) => setV((current) => ({ ...current, [key]: value }));
  const input = (key: keyof JobCardValues, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label" htmlFor={`jc-${key}`}>{label}</label>
      <input id={`jc-${key}`} className="input" value={String(v[key] ?? "")} onChange={(e) => set(key, e.target.value as never)} {...extra} />
    </div>
  );

  // Live checks (debounced): number taken, asset match, open card on the asset.
  const checkKey = JSON.stringify([v.code, assetMode === "chosen" ? v.assetId : "", v.assetCode, v.plateNo, v.chassisNo, assetMode]);
  useEffect(() => {
    if (assetMode === "new" && !v.code) return;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await api<Check>("/api/job-cards/check", {
          body: {
            code: v.code,
            exceptId: jobCardId,
            ...(assetMode === "chosen" ? { assetId: v.assetId } : assetMode === "auto" ? { assetCode: v.assetCode, plateNo: v.plateNo, chassisNo: v.chassisNo } : {}),
          },
        });
        setCheck(result);
      } catch {
        setCheck(null);
      } finally {
        setChecking(false);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const matched = assetMode === "auto" || assetMode === "chosen" ? check?.asset ?? null : null;
  const numberTaken = !!check?.existing;
  // Editing a card keeps its asset; only a change of asset on an open card is checked again.
  const openConflict =
    !!check?.openCard &&
    assetMode !== "new" &&
    assetMode !== "none" &&
    (mode === "new" || (cardStatus === "OPEN" && matched?.id !== initial.assetId));
  const blocked = numberTaken || (openConflict && !(isAdmin && allowSecondOpen)) || !v.code.trim() || (assetMode === "new" && !newAsset.code.trim());

  async function save() {
    setBusy(true);
    setError("");
    const body = {
      code: v.code,
      dateIn: v.dateIn,
      dateOut: v.dateOut,
      previousReading: v.previousReading,
      currentReading: v.currentReading,
      jobType: v.jobType,
      repairAt: v.repairAt,
      project: v.project,
      operatorName: v.operatorName,
      receivedBy: v.receivedBy,
      createdByName: v.createdByName,
      tasks: v.tasks.filter((t) => t.description.trim()),
      customFields: v.customFields,
      ...(assetMode === "new" ? { newAsset } : { assetId: assetMode === "none" ? "" : (matched?.id ?? "") }),
      ...(isAdmin && allowSecondOpen ? { allowSecondOpen: true } : {}),
      ...(photoPath ? { photoPath } : {}),
    };
    try {
      if (mode === "new") {
        const created = await api<{ id: string }>("/api/job-cards", { body });
        router.push(`/job-cards/${created.id}`);
      } else {
        await api(`/api/job-cards/${jobCardId}`, { method: "PATCH", body });
        router.push(`/job-cards/${jobCardId}`);
        router.refresh();
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <h2 className="font-semibold">Job card</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {input("code", "Job card no. (Rep.Order Number) *", { className: "input font-mono uppercase", autoComplete: "off" })}
          {input("dateIn", "Date in", { type: "date" })}
          {mode === "edit" ? input("dateOut", "Date out", { type: "date" }) : null}
          <div>
            <label className="label" htmlFor="jc-jobType">Job type</label>
            <input id="jc-jobType" className="input" list="job-types" value={v.jobType} onChange={(e) => set("jobType", e.target.value)} />
            <datalist id="job-types">
              {JOB_TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>
        {numberTaken && check?.existing && (
          <Alert>
            Job card <b>{check.existing.code}</b> already exists.{" "}
            <Link className="underline" href={`/job-cards/${check.existing.id}`}>Open it</Link>
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {input("previousReading", "Previous HM/KM", { inputMode: "decimal" })}
          {input("currentReading", "Current HM/KM", { inputMode: "decimal" })}
          {input("repairAt", "Repair at")}
          {input("project", "Project")}
          {input("operatorName", "Operator name")}
          {input("receivedBy", "Received by")}
          {input("createdByName", "Created by (on the card)")}
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Asset</h2>
          {checking && <span className="text-xs text-gray-500">Checking…</span>}
        </div>

        {assetMode !== "new" && (
          <div className="grid gap-3 sm:grid-cols-3">
            {input("assetCode", "Asset code (Code on the card)", { className: "input font-mono uppercase", disabled: assetMode === "chosen" })}
            {input("plateNo", "Plate no.", { className: "input font-mono", disabled: assetMode === "chosen" })}
            {input("chassisNo", "Chassis no.", { className: "input font-mono", disabled: assetMode === "chosen" })}
          </div>
        )}
        {(v.description || v.yearOfMake) && assetMode !== "new" && (
          <p className="text-xs text-gray-500">
            On the card: {v.description}
            {v.yearOfMake && ` · YoM ${v.yearOfMake}`}
          </p>
        )}

        {assetMode === "none" ? (
          <Alert kind="warning">
            No asset will be linked to this job card.{" "}
            <button className="underline" onClick={() => setAssetMode("auto")}>Link an asset</button>
          </Alert>
        ) : assetMode === "new" ? (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            <p className="text-sm font-medium">New asset (the rest of its details can be completed on the Assets page)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <AssetInput label="Asset code *" value={newAsset.code} onChange={(code) => setNewAsset({ ...newAsset, code })} mono />
              <AssetInput label="Description" value={newAsset.description} onChange={(description) => setNewAsset({ ...newAsset, description })} />
              <AssetInput label="Plate no." value={newAsset.plateNo} onChange={(plateNo) => setNewAsset({ ...newAsset, plateNo })} mono />
              <AssetInput label="Chassis no." value={newAsset.chassisNo} onChange={(chassisNo) => setNewAsset({ ...newAsset, chassisNo })} mono />
              <AssetInput label="Year of make" value={newAsset.yearOfMake} onChange={(yearOfMake) => setNewAsset({ ...newAsset, yearOfMake })} />
            </div>
            <button className="btn btn-sm" onClick={() => setAssetMode("auto")}>
              <X className="h-3.5 w-3.5" /> Don&apos;t create, find an existing asset
            </button>
          </div>
        ) : matched ? (
          <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
            <span className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-700" />
              <span>
                <b className="font-mono">{matched.code}</b> {matched.description}
                <span className="block text-xs text-gray-600">
                  Matched {BY_LABEL[matched.by]}
                  {matched.plateNo && ` · Plate ${matched.plateNo}`}
                  {!matched.active && " · inactive asset"}
                </span>
              </span>
            </span>
            <AssetPicker
              onPick={(asset) => {
                set("assetId", asset.id);
                setAssetMode("chosen");
              }}
              label="Choose another"
            />
          </div>
        ) : (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              {v.assetCode || v.plateNo || v.chassisNo
                ? "No asset found with this code, plate or chassis no."
                : "Enter the asset code, plate or chassis no., or choose the asset."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-sm"
                onClick={() => {
                  setNewAsset({ code: v.assetCode, description: v.description, plateNo: v.plateNo, chassisNo: v.chassisNo, yearOfMake: v.yearOfMake });
                  setAssetMode("new");
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Create asset from this card
              </button>
              <AssetPicker
                onPick={(asset) => {
                  set("assetId", asset.id);
                  setAssetMode("chosen");
                }}
                label="Choose an asset"
              />
              <button className="btn btn-sm" onClick={() => setAssetMode("none")}>No asset</button>
            </div>
          </div>
        )}
        {assetMode === "chosen" && (
          <button
            className="text-xs text-brand underline"
            onClick={() => {
              set("assetId", "");
              setAssetMode("auto");
            }}
          >
            Match the asset from the code / plate / chassis instead
          </button>
        )}

        {openConflict && check?.openCard && (
          <Alert kind={isAdmin && allowSecondOpen ? "warning" : "error"}>
            This asset already has an open job card:{" "}
            <Link className="font-mono font-semibold underline" href={`/job-cards/${check.openCard.id}`}>{check.openCard.code}</Link>
            {check.openCard.dateIn && ` (in ${check.openCard.dateIn.split("-").reverse().join("/")})`}. Close it first.
            {isAdmin ? (
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={allowSecondOpen} onChange={(e) => setAllowSecondOpen(e.target.checked)} />
                Add anyway (admin): this asset will have two open job cards
              </label>
            ) : (
              <span className="block">Only an admin can add a second open job card for the same asset.</span>
            )}
          </Alert>
        )}
      </div>

      <div className="card space-y-2 p-4">
        <h2 className="font-semibold">Work done</h2>
        {v.tasks.length === 0 && <p className="text-sm text-gray-500">No task lines.</p>}
        {v.tasks.map((task, index) => (
          <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="hidden w-5 text-right text-xs text-gray-500 sm:block">{index + 1}</span>
            <input
              className="input flex-1"
              value={task.description}
              placeholder="Task description"
              onChange={(e) => set("tasks", v.tasks.map((t, i) => (i === index ? { ...t, description: e.target.value } : t)))}
            />
            <div className="flex gap-2">
              <input
                type="date"
                className="input sm:w-40"
                aria-label="From"
                value={task.fromDate}
                onChange={(e) => set("tasks", v.tasks.map((t, i) => (i === index ? { ...t, fromDate: e.target.value } : t)))}
              />
              <button className="btn btn-sm" aria-label="Remove line" onClick={() => set("tasks", v.tasks.filter((_, i) => i !== index))}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => set("tasks", [...v.tasks, { description: "", fromDate: "" }])}>
          <Plus className="h-3.5 w-3.5" /> Add line
        </button>
      </div>

      {fields.length > 0 && (
        <div className="card p-4">
          <CustomFieldInputs fields={fields} values={v.customFields} onChange={(customFields) => set("customFields", customFields)} />
        </div>
      )}

      {error && <Alert>{error}</Alert>}
      <div className="flex justify-end gap-2">
        {mode === "edit" && (
          <Link className="btn" href={`/job-cards/${jobCardId}`}>Cancel</Link>
        )}
        <button className="btn btn-primary" onClick={save} disabled={busy || blocked}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : mode === "new" ? "Save job card" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function AssetInput({ label, value, onChange, mono }: { label: string; value: string; onChange: (value: string) => void; mono?: boolean }) {
  return (
    <div>
      <span className="label">{label}</span>
      <input className={`input ${mono ? "font-mono uppercase" : ""}`} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function AssetPicker({ onPick, label }: { onPick: (asset: AssetLite) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AssetLite[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !q.trim()) return;
    const timer = setTimeout(async () => {
      try {
        setResults((await api<{ assets: AssetLite[] }>(`/api/assets/search?q=${encodeURIComponent(q.trim())}`)).assets);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button className="btn btn-sm" onClick={() => setOpen((o) => !o)}>
        <Search className="h-3.5 w-3.5" /> {label}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <input className="input" autoFocus placeholder="Code, description, plate, chassis" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-1 max-h-64 overflow-y-auto">
            {q.trim() && results.length === 0 && <p className="px-2 py-2 text-xs text-gray-500">No assets found.</p>}
            {(q.trim() ? results : []).map((asset) => (
              <button
                key={asset.id}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50"
                onClick={() => {
                  onPick(asset);
                  setOpen(false);
                }}
              >
                <span className="font-mono font-semibold">{asset.code}</span> {asset.description}
                <span className="block text-xs text-gray-500">
                  {asset.plateNo && `Plate ${asset.plateNo}`} {!asset.active && "· inactive"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
