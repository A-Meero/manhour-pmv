"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { api, errorMessage } from "@/lib/client";

export function JobCardStatusButton({ jobCardId, code, status }: { jobCardId: string; code: string; status: "OPEN" | "CLOSED" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const closing = status === "OPEN";

  async function run() {
    const question = closing
      ? `Close job card ${code}? Running work sessions are stopped, and no more time or parts can be added.`
      : `Reopen job card ${code}?`;
    if (!confirm(question)) return;
    setBusy(true);
    try {
      const result = await api<{ stopped: number }>(`/api/job-cards/${jobCardId}/status`, { body: { status: closing ? "CLOSED" : "OPEN" } });
      if (result.stopped) alert(`${result.stopped} running session(s) were stopped.`);
      router.refresh();
    } catch (err) {
      alert(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={`btn ${closing ? "" : "btn-primary"}`} onClick={run} disabled={busy}>
      {closing ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />} {busy ? "Saving…" : closing ? "Close job card" : "Reopen job card"}
    </button>
  );
}
