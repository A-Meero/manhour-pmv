"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, Plus, RotateCcw, Send, ShoppingCart, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";
import type { ClientPartRequest, ClientRequestLine } from "@/lib/part-requests";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kuwait", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const qtyText = (qty: number | null) => (qty === null ? "" : `${qty.toLocaleString("en-US", { maximumFractionDigits: 3 })} × `);

export function RequestStatus({ status }: { status: ClientPartRequest["status"] | ClientRequestLine["status"] }) {
  if (status === "FULFILLED" || status === "DONE") return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">{status === "DONE" ? "Done" : "Fulfilled"}</span>;
  if (status === "MR_RAISED") return <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">MR raised</span>;
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Open</span>;
}

/**
 * Spare part requests on a job card. The received-by team leader (or his supervisor) lists the parts needed, one line
 * each; the store issues them as usual and ticks each line done, or records an MR for what has to be bought.
 */
export function PartRequestsPanel({
  jobCardId,
  requests,
  canRequest,
  isStore,
  cardOpen,
}: {
  jobCardId: string;
  requests: ClientPartRequest[];
  canRequest: boolean;
  isStore: boolean;
  cardOpen: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState([{ description: "", qty: "" }]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showDone, setShowDone] = useState(false);
  const pending = requests.filter((r) => r.status !== "FULFILLED");
  const done = requests.filter((r) => r.status === "FULFILLED");
  const filled = lines.filter((l) => l.description.trim());

  async function send() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/job-cards/${jobCardId}/requests`, { body: { lines: filled, note } });
      setLines([{ description: "", qty: "" }]);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!canRequest && !isStore && requests.length === 0) return null;

  return (
    <div id="part-requests" className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <ClipboardList className="h-4 w-4" /> Part requests
        {pending.length > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-800">{pending.length} open</span>}
      </h2>

      {canRequest && cardOpen && (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          <p className="text-sm font-medium">Request parts from the store</p>
          {lines.map((line, index) => (
            <div key={index} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={index === 0 ? "Part, e.g. Front brake pads (Nissan Navara 2016)" : "Part"}
                value={line.description}
                maxLength={500}
                onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, description: e.target.value } : l)))}
              />
              <input
                className="input w-20"
                placeholder="Qty"
                inputMode="decimal"
                value={line.qty}
                onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, qty: e.target.value } : l)))}
              />
              {lines.length > 1 && (
                <button className="btn btn-sm" aria-label="Remove line" onClick={() => setLines(lines.filter((_, i) => i !== index))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button className="btn btn-sm" onClick={() => setLines([...lines, { description: "", qty: "" }])} disabled={lines.length >= 50}>
            <Plus className="h-3.5 w-3.5" /> Add line
          </button>
          <input className="input" placeholder="Note for the store (optional)" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={send} disabled={busy || filled.length === 0}>
              <Send className="h-4 w-4" /> {busy ? "Sending…" : "Send to the store"}
            </button>
          </div>
        </div>
      )}
      {error && <Alert>{error}</Alert>}

      {requests.length === 0 && <p className="text-sm text-gray-500">No part requests on this job card.</p>}
      {pending.map((request) => (
        <RequestItem key={request.id} request={request} isStore={isStore} />
      ))}
      {done.length > 0 && (
        <div>
          <button className="text-sm text-brand underline" onClick={() => setShowDone((s) => !s)}>
            {showDone ? "Hide" : "Show"} {done.length} fulfilled request{done.length > 1 ? "s" : ""}
          </button>
          {showDone && (
            <div className="mt-2 space-y-2">
              {done.map((request) => (
                <RequestItem key={request.id} request={request} isStore={isStore} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RequestItem({ request, isStore }: { request: ClientPartRequest; isStore: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function completeAll() {
    if (!confirm("Mark every line of this request done?")) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/part-requests/${request.id}`, { method: "PATCH", body: { action: "fulfil" } });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-lg border p-3 text-sm ${request.status === "FULFILLED" ? "border-gray-200 bg-gray-50" : "border-amber-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {request.requestedBy || "—"} · {when(request.createdAt)}
          {request.status === "FULFILLED" && request.fulfilledAt && ` · fulfilled ${when(request.fulfilledAt)}`}
        </span>
        <RequestStatus status={request.status} />
      </div>
      <ul className="mt-2 divide-y divide-gray-100">
        {request.lines.map((line) => (
          <LineRow key={line.id} line={line} isStore={isStore} />
        ))}
      </ul>
      {request.text && <p className="mt-1 text-xs text-gray-600">Note: {request.text}</p>}
      {isStore && request.status !== "FULFILLED" && request.lines.length > 1 && (
        <button className="btn btn-sm mt-2" onClick={completeAll} disabled={busy}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Mark all done
        </button>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function LineRow({ line, isStore }: { line: ClientRequestLine; isStore: boolean }) {
  const router = useRouter();
  const [mr, setMr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "mr" | "done" | "reopen", mrNumber?: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/part-request-lines/${line.id}`, { method: "PATCH", body: { action, mrNumber } });
      setMr(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={line.status === "DONE" ? "text-gray-500 line-through decoration-gray-300" : ""}>
          {qtyText(line.qty)}
          {line.description}
          {line.mrNumber && <span className="ml-1 text-xs text-blue-700">(MR {line.mrNumber})</span>}
        </span>
        <span className="flex items-center gap-1">
          <RequestStatus status={line.status} />
          {isStore && line.status !== "DONE" && mr === null && (
            <>
              <button className="btn btn-sm" title="Record the MR for this part" onClick={() => setMr(line.mrNumber)} disabled={busy}>
                <ShoppingCart className="h-3.5 w-3.5" /> MR
              </button>
              <button className="btn btn-sm" title="Issued: tick this line done" onClick={() => act("done")} disabled={busy}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Done
              </button>
            </>
          )}
          {isStore && line.status === "DONE" && (
            <button className="btn btn-sm" title="Not done after all" onClick={() => act("reopen")} disabled={busy}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
      {mr !== null && (
        <div className="mt-1 flex gap-2">
          <input className="input" placeholder="MR number" value={mr} onChange={(e) => setMr(e.target.value)} autoFocus />
          <button className="btn btn-sm btn-primary" onClick={() => act("mr", mr)} disabled={busy || !mr.trim()}>Save</button>
          <button className="btn btn-sm" onClick={() => setMr(null)}>Cancel</button>
        </div>
      )}
      {line.status === "DONE" && line.doneBy && <p className="text-xs text-gray-400">Done by {line.doneBy} {when(line.doneAt)}</p>}
      {error && <Alert>{error}</Alert>}
    </li>
  );
}
