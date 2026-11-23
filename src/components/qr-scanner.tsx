"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard } from "lucide-react";
import { LiveQrScanner } from "@/components/live-qr-scanner";
import { parseQr, qrHref, QR_KIND_LABEL, type QrKind } from "@/lib/qr-codes";

/** Finds the job card number in a scanned QR: a /jc/<no> link (any host) or a bare number. */
export function jobCardFromQr(text: string): string | null {
  const target = parseQr(text, "jobcard");
  return target?.kind === "jobcard" ? target.code : null;
}

/**
 * The Scan page: the camera opens straight away and the first known QR code opens its page —
 * a job card (start / stop work, issue parts, close), an asset, or an inventory item.
 */
export function QrScanner({ kinds }: { kinds: QrKind[] }) {
  const router = useRouter();
  const [manual, setManual] = useState("");
  const [opening, setOpening] = useState("");

  function onDetect(text: string) {
    const target = parseQr(text, "jobcard");
    if (!target || !kinds.includes(target.kind)) return false;
    setOpening(`Opening ${QR_KIND_LABEL[target.kind]} ${target.code}…`);
    router.push(qrHref(target));
    return true;
  }

  const names = kinds.map((kind) => QR_KIND_LABEL[kind]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="card p-3">
        <LiveQrScanner
          onDetect={onDetect}
          paused={!!opening}
          hint={opening || `Point the camera at a ${list} QR code. It opens as soon as it is recognised.`}
          unknownMessage={`This is not a ${list} QR code.`}
        />
      </div>

      <form
        className="card space-y-2 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const code = manual.trim();
          if (code) router.push(`/jc/${encodeURIComponent(code)}`);
        }}
      >
        <label className="label flex items-center gap-2" htmlFor="manual-code">
          <Keyboard className="h-4 w-4" /> Or type the job card number
        </label>
        <div className="flex gap-2">
          <input id="manual-code" className="input font-mono uppercase" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. JC-1001" />
          <button className="btn" disabled={!manual.trim()}>Open</button>
        </div>
      </form>
    </div>
  );
}
