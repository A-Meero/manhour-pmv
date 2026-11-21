"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Play, Square } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";

type Props = {
  jobCardId: string;
  code: string;
  /** ISO start of the running session on THIS card */
  runningSince: string | null;
  /** Code of a card the technician is working on right now, if it's another one */
  otherRunning: string | null;
  blocker: string;
  hoursToday: number;
  hoursTotal: number;
  /** Still clocked in after the shift ("running"), or stopped at the hour limit after it ("limit"), not yet answered */
  afterShift: { kind: "running" | "limit"; shiftEnd: string; stoppedAt: string } | null;
};

function elapsed(since: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function WorkPanel({ jobCardId, code, runningSince, otherRunning, blocker, hoursToday, hoursTotal, afterShift }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!runningSince) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [runningSince]);

  async function answer(action: "continue" | "shift-end" | "keep") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/job-cards/${jobCardId}/work`, { body: { action } });
      setNotice(
        action === "continue"
          ? "OK, the timer keeps running. Remember to stop when you finish."
          : action === "shift-end"
            ? `Saved: you finished at ${afterShift?.shiftEnd}.`
            : "Saved. Your supervisor will check the time.",
      );
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "start" | "stop") {
    if (action === "start" && otherRunning && !confirm(`You are working on ${otherRunning}. Stop it and start ${code}?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ stoppedOther?: string }>(`/api/job-cards/${jobCardId}/work`, { body: { action } });
      setNotice(action === "start" ? (result.stoppedOther ? `Stopped ${result.stoppedOther}. Started ${code}.` : `Started ${code}.`) : `Stopped. Your time on ${code} is saved.`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <div className="text-center">
        {runningSince ? (
          <>
            <p className="text-sm font-medium text-green-700">Working since {new Date(runningSince).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums">{elapsed(runningSince, now)}</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">{blocker ? "" : "Not working on this job card right now."}</p>
        )}
      </div>
      {afterShift ? (
        <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-orange-900">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            {afterShift.kind === "running"
              ? `Your shift ended at ${afterShift.shiftEnd} and you are still clocked in on ${code}.`
              : `You did not stop after your shift (it ended at ${afterShift.shiftEnd}), so the timer was stopped at ${afterShift.stoppedAt} when your hour limit was reached.`}
          </p>
          {afterShift.kind === "running" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn w-full border-green-600 bg-green-600 py-4 text-white hover:bg-green-700" disabled={busy} onClick={() => answer("continue")}>
                <Play className="h-5 w-5" /> Continue working
              </button>
              <button className="btn btn-primary w-full py-4" disabled={busy} onClick={() => answer("shift-end")}>
                <CheckCircle2 className="h-5 w-5" /> I finished at {afterShift.shiftEnd}
              </button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn btn-primary w-full py-4" disabled={busy} onClick={() => answer("shift-end")}>
                <CheckCircle2 className="h-5 w-5" /> I finished at {afterShift.shiftEnd}
              </button>
              <button className="btn w-full py-4" disabled={busy} onClick={() => answer("keep")}>
                <Clock className="h-5 w-5" /> I worked until {afterShift.stoppedAt.split(" ").pop()}
              </button>
            </div>
          )}
        </div>
      ) : blocker && !runningSince ? (
        <Alert kind="warning">{blocker}</Alert>
      ) : runningSince ? (
        <button className="btn btn-primary w-full py-5 text-lg" disabled={busy} onClick={() => act("stop")}>
          <Square className="h-6 w-6" /> {busy ? "Saving…" : "Stop work"}
        </button>
      ) : (
        <button className="btn w-full border-green-600 bg-green-600 py-5 text-lg text-white hover:bg-green-700" disabled={busy} onClick={() => act("start")}>
          <Play className="h-6 w-6" /> {busy ? "Starting…" : "Start work"}
        </button>
      )}
      {otherRunning && !runningSince && !blocker && (
        <p className="text-center text-xs text-amber-700">You are still working on {otherRunning}; starting here stops it.</p>
      )}
      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Today</p>
          <p className="text-xl font-bold">{fmt(hoursToday)}h</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total on this card</p>
          <p className="text-xl font-bold">{fmt(hoursTotal)}h</p>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400">Finished sessions only; the running one is added when you stop.</p>
    </div>
  );
}
