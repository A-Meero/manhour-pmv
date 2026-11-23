"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Lock, LockOpen } from "lucide-react";
import { api, ApiError, errorMessage } from "@/lib/client";
import { Modal } from "@/components/ui";

type Blocked = { message: string; blockers: string[]; canForce: boolean };

/**
 * Close / reopen a job card. Closing is refused while something is still to do (document not uploaded, part requests
 * not fulfilled, someone still working); the reasons are listed, and an admin may close anyway.
 */
export function JobCardStatusButton({ jobCardId, code, status }: { jobCardId: string; code: string; status: "OPEN" | "CLOSED" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const closing = status === "OPEN";

  async function send(force: boolean) {
    setBusy(true);
    try {
      const result = await api<{ stopped: number }>(`/api/job-cards/${jobCardId}/status`, { body: { status: closing ? "CLOSED" : "OPEN", force } });
      setBlocked(null);
      if (result.stopped) alert(`${result.stopped} running session(s) were stopped.`);
      router.refresh();
    } catch (err) {
      const details = err instanceof ApiError && err.status === 409 ? (err.details as { blockers?: string[]; canForce?: boolean } | undefined) : undefined;
      if (details?.blockers?.length) setBlocked({ message: err instanceof Error ? err.message : "", blockers: details.blockers, canForce: !!details.canForce });
      else alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function run() {
    const question = closing
      ? `Close job card ${code}? Running work sessions are stopped, and no more time or parts can be added.`
      : `Reopen job card ${code}?`;
    if (confirm(question)) void send(false);
  }

  return (
    <>
      <button className={`btn ${closing ? "" : "btn-primary"}`} onClick={run} disabled={busy}>
        {closing ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />} {busy ? "Saving…" : closing ? "Close job card" : "Reopen job card"}
      </button>
      {blocked && (
        <Modal title={`Close job card ${code}`} onClose={() => setBlocked(null)}>
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm font-medium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {blocked.message}
            </p>
            <ul className="list-disc space-y-1 pl-6 text-sm text-gray-700">
              {blocked.blockers.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {!blocked.canForce && <p className="text-xs text-gray-500">Sort these out first, or ask an admin to close it.</p>}
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setBlocked(null)}>{blocked.canForce ? "Cancel" : "OK"}</button>
              {blocked.canForce && (
                <button className="btn btn-primary" onClick={() => send(true)} disabled={busy}>
                  {busy ? "Closing…" : "Close anyway (admin)"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
