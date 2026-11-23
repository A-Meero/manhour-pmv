"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { dismissPrompt, enablePush, promptDismissed, pushSupport, registerServiceWorker, syncSubscription } from "@/lib/push-client";

/**
 * Asks the signed-in user to turn on notifications on this device. Browsers only show their permission prompt after a
 * tap, so this is a banner with a button. Hidden for 7 days after "Not now"; never shown once answered.
 */
export function PushPrompt() {
  const [mode, setMode] = useState<"hidden" | "ask" | "install">("hidden");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await registerServiceWorker();
      const support = pushSupport();
      if (cancelled) return;
      if (support === "supported") {
        if (Notification.permission === "granted") void syncSubscription();
        else if (Notification.permission === "default" && !promptDismissed()) setMode("ask");
      } else if (support === "needs-install" && !promptDismissed()) {
        setMode("install");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (mode === "hidden") return null;

  async function turnOn() {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result === "granted") {
      setMessage("Notifications are on for this device.");
      setTimeout(() => setMode("hidden"), 2500);
    } else if (result === "denied") {
      setMessage("Notifications are blocked for this site. Allow them in the browser's site settings to get them.");
      dismissPrompt(30);
    } else if (result === "failed") {
      setMessage("This device could not be set up for notifications. Try again later from My account.");
    } else {
      dismissPrompt();
      setMode("hidden");
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-950">
      <BellRing className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {message ||
          (mode === "ask"
            ? "Get your notifications on this device, even when the app is closed."
            : "To get notifications on this iPhone / iPad: tap Share › Add to Home Screen, open the app from there, then turn them on.")}
      </span>
      {mode === "ask" && !message && (
        <button className="btn btn-sm btn-primary" onClick={turnOn} disabled={busy}>
          {busy ? "Turning on…" : "Turn on"}
        </button>
      )}
      <button
        className="rounded p-1 text-blue-900 hover:bg-blue-100"
        aria-label="Not now"
        title="Not now"
        onClick={() => {
          dismissPrompt();
          setMode("hidden");
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
