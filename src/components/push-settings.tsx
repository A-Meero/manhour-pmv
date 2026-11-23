"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Send, Smartphone } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";
import { NOTIFICATION_KINDS } from "@/lib/notification-kinds";
import { deviceSubscribed, disablePush, enablePush, isStandalone, pushSupport, type PushSupport } from "@/lib/push-client";

/** Account page: push notifications on this device, which kinds to push, a test, and how to install the app. */
export function PushSettings({ muted: initialMuted, devices }: { muted: string[]; devices: number }) {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [muted, setMuted] = useState<string[]>(initialMuted);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      setSupport(pushSupport());
      setInstalled(isStandalone());
      setSubscribed(await deviceSubscribed().catch(() => false));
    })();
  }, []);

  async function toggleDevice() {
    setBusy(true);
    setMessage(null);
    if (subscribed) {
      await disablePush();
      setSubscribed(false);
      setMessage({ kind: "info", text: "Notifications are off on this device." });
    } else {
      const result = await enablePush();
      if (result === "granted") {
        setSubscribed(true);
        setMessage({ kind: "success", text: "Notifications are on for this device." });
      } else if (result === "denied") {
        setMessage({ kind: "error", text: "Notifications are blocked for this site. Allow them in the browser's site settings, then try again." });
      } else {
        setMessage({ kind: "error", text: "This device could not be set up for notifications." });
      }
    }
    setBusy(false);
  }

  async function saveMuted(next: string[]) {
    setMuted(next);
    try {
      await api("/api/account/push-prefs", { method: "PUT", body: { mutedPushKinds: next } });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ devices: number; sent: number }>("/api/push/test", { body: {} });
      setMessage(
        result.sent
          ? { kind: "success", text: `Test sent to ${result.sent} device${result.sent > 1 ? "s" : ""}. It should appear in a few seconds.` }
          : { kind: "error", text: result.devices ? "The test could not be delivered. Check that the server has internet access." : "No device is set up for notifications yet." },
      );
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-5 max-w-xl space-y-4 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <BellRing className="h-4 w-4" /> Notifications on your devices
      </h2>
      {support === "needs-https" && <Alert kind="warning">Push notifications need the app to be opened over https.</Alert>}
      {support === "needs-install" && (
        <Alert kind="info">On iPhone / iPad: tap Share › <b>Add to Home Screen</b>, open the app from the Home Screen, then turn notifications on here.</Alert>
      )}
      {support === "unsupported" && <Alert kind="warning">This browser doesn&apos;t support push notifications.</Alert>}
      {support === "supported" && (
        <div className="flex flex-wrap items-center gap-3">
          <button className={`btn ${subscribed ? "" : "btn-primary"}`} onClick={toggleDevice} disabled={busy}>
            {subscribed ? <BellOff className="h-4 w-4" /> : <BellRing className="h-4 w-4" />} {subscribed ? "Turn off on this device" : "Turn on for this device"}
          </button>
          <button className="btn" onClick={test} disabled={busy || devices + (subscribed ? 1 : 0) === 0}>
            <Send className="h-4 w-4" /> Send a test
          </button>
          <span className="text-xs text-gray-500">{devices} device{devices === 1 ? "" : "s"} set up</span>
        </div>
      )}
      {message && <Alert kind={message.kind}>{message.text}</Alert>}

      <div>
        <p className="mb-1 text-sm font-medium">Send these as push notifications</p>
        <p className="mb-2 text-xs text-gray-500">Everything still appears under the bell in the app; this only changes what pops up on your devices.</p>
        <div className="space-y-1">
          {NOTIFICATION_KINDS.map(({ kind, label }) => (
            <label key={kind} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!muted.includes(kind)}
                onChange={(e) => saveMuted(e.target.checked ? muted.filter((k) => k !== kind) : [...muted, kind])}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-100 pt-3 text-sm text-gray-600">
        <p className="flex items-center gap-2 font-medium text-gray-900">
          <Smartphone className="h-4 w-4" /> Install as an app {installed && <span className="text-xs font-normal text-green-700">(installed)</span>}
        </p>
        <p className="mt-1">
          Android (Chrome): menu ⋮ › <b>Install app</b> / Add to Home screen. iPhone (Safari): Share › <b>Add to Home Screen</b>. Computer (Chrome / Edge): the
          install icon in the address bar. The app then opens full screen from its own icon.
        </p>
      </div>
    </div>
  );
}
