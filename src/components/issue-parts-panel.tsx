"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";
import { formatMoney, formatQty } from "@/lib/money";

type PartOption = { id: string; partNo: string; name: string; unit: string; qtyOnHand: number; unitCost: number };
type Line = { part: PartOption; qty: string };
export type IssuedLine = {
  id: string;
  kind: "ISSUE" | "ISSUE_REVERSAL";
  partNo: string;
  name: string;
  unit: string;
  qty: number;
  unitCost: number;
  cost: number;
  by: string;
  at: string;
  note: string;
  reversed: boolean;
};

/** Store manager: pick parts from stock and issue them to the job card; return a mistaken line. */
export function IssuePartsPanel({ jobCardId, closed, issued, canIssue }: { jobCardId: string; closed: boolean; issued: IssuedLine[]; canIssue: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PartOption[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!canIssue) return;
    const handle = setTimeout(async () => {
      try {
        const data = await api<{ parts: PartOption[] }>(`/api/parts?q=${encodeURIComponent(q.trim())}`);
        setResults(data.parts);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [q, canIssue]);

  function add(part: PartOption) {
    setLines((current) => (current.some((line) => line.part.id === part.id) ? current : [...current, { part, qty: "1" }]));
    setQ("");
  }

  async function issue() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/job-cards/${jobCardId}/parts`, { body: { lines: lines.map((line) => ({ partId: line.part.id, qty: line.qty })), note } });
      setNotice(`${lines.length} part line(s) issued.`);
      setLines([]);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reverse(line: IssuedLine) {
    const reason = prompt(`Return ${formatQty(line.qty)} ${line.unit} of ${line.partNo} to stock? Write the reason:`);
    if (!reason?.trim()) return;
    try {
      await api(`/api/stock-movements/${line.id}/reverse`, { body: { note: reason } });
      router.refresh();
    } catch (err) {
      alert(errorMessage(err));
    }
  }

  const total = issued.reduce((sum, line) => sum + line.cost, 0);

  return (
    <div className="card space-y-4 p-5">
      <h2 className="font-semibold">Spare parts</h2>
      {canIssue && !closed && (
        <div className="space-y-3">
          <input className="input" placeholder="Search part no. or name" value={q} onChange={(e) => setQ(e.target.value)} />
          {results.length > 0 && (
            <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200 text-sm">
              {results.map((part) => (
                <li key={part.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50" disabled={part.qtyOnHand <= 0} onClick={() => add(part)}>
                    <span className="min-w-0">
                      <span className="font-mono font-semibold">{part.partNo}</span> <span className="text-gray-600">{part.name}</span>
                    </span>
                    <span className={`shrink-0 text-xs ${part.qtyOnHand <= 0 ? "text-red-600" : "text-gray-500"}`}>
                      {formatQty(part.qtyOnHand)} {part.unit} <Plus className="inline h-3.5 w-3.5" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 && (
            <div className="space-y-2">
              {lines.map((line, index) => (
                <div key={line.part.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-mono font-semibold">{line.part.partNo}</span> {line.part.name}
                    <span className="block text-xs text-gray-500">{formatQty(line.part.qtyOnHand)} {line.part.unit} in stock</span>
                  </span>
                  <input
                    className="input w-24"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={line.qty}
                    onChange={(e) => setLines(lines.map((entry, i) => (i === index ? { ...entry, qty: e.target.value } : entry)))}
                  />
                  <span className="w-10 text-xs text-gray-500">{line.part.unit}</span>
                  <button className="btn btn-sm btn-danger" onClick={() => setLines(lines.filter((_, i) => i !== index))} aria-label="Remove line">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <input className="input" placeholder="Note (optional), e.g. technician name" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn btn-primary w-full" disabled={busy} onClick={issue}>{busy ? "Issuing…" : "Issue to job card"}</button>
            </div>
          )}
        </div>
      )}
      {closed && canIssue && <Alert kind="info">This job card is closed; parts can no longer be issued.</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {issued.length === 0 ? (
        <p className="text-sm text-gray-500">No parts issued to this job card yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Part</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit cost</th>
                <th className="text-right">Cost</th>
                <th>By</th>
                {canIssue && <th />}
              </tr>
            </thead>
            <tbody>
              {issued.map((line) => (
                <tr key={line.id} className={line.kind === "ISSUE_REVERSAL" || line.reversed ? "text-gray-400" : ""}>
                  <td>
                    <span className="font-mono font-semibold">{line.partNo}</span> {line.name}
                    {line.kind === "ISSUE_REVERSAL" && <span className="block text-xs">Returned: {line.note}</span>}
                    {line.kind === "ISSUE" && line.note && <span className="block text-xs text-gray-500">{line.note}</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">{formatQty(line.qty)} {line.unit}</td>
                  <td className="text-right">{formatMoney(line.unitCost, false)}</td>
                  <td className="text-right">{formatMoney(line.cost, false)}</td>
                  <td className="whitespace-nowrap text-xs">{line.by}<span className="block text-gray-400">{line.at}</span></td>
                  {canIssue && (
                    <td>
                      {line.kind === "ISSUE" && !line.reversed && !closed && (
                        <button className="btn btn-sm" onClick={() => reverse(line)} title="Return to stock">
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="text-right font-semibold">Parts total</td>
                <td className="text-right font-semibold">{formatMoney(total)}</td>
                <td colSpan={canIssue ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
