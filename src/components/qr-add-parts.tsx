"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, QrCode } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { formatQty } from "@/lib/money";
import { parseQr } from "@/lib/qr-codes";
import { Alert, Modal } from "@/components/ui";
import { LiveQrScanner } from "@/components/live-qr-scanner";

type Part = { id: string; partNo: string; name: string; unit: string; qtyOnHand: number; active: boolean };

/**
 * Store manager: "Add items by QR code" on a job card. The camera opens; each item QR scanned shows the item with
 * quantity 1 (editable) and Add, which issues it from stock to this job card. Then the camera scans the next one.
 */
export function QrAddParts({ jobCardId, jobCardCode }: { jobCardId: string; jobCardCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<Part | null>(null);
  const [looking, setLooking] = useState(false);
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string[]>([]);

  function onDetect(text: string) {
    const target = parseQr(text, "part");
    if (target?.kind !== "part") return false;
    setLooking(true);
    setError("");
    api<{ part: Part }>(`/api/parts/by-code?code=${encodeURIComponent(target.code)}`)
      .then((result) => {
        setPart(result.part);
        setQty("1");
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLooking(false));
    return true;
  }

  async function add() {
    if (!part) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/job-cards/${jobCardId}/parts`, { body: { lines: [{ partId: part.id, qty }], note: "Added by QR scan" } });
      setAdded((list) => [`${formatQty(Number(qty))} ${part.unit} ${part.partNo} – ${part.name}`, ...list]);
      setPart(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const amount = Number(qty);
  const short = !!part && amount > part.qtyOnHand + 0.0005;

  function close() {
    setOpen(false);
    setPart(null);
    setError("");
    setAdded([]);
  }

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <QrCode className="h-4 w-4" /> Add items by QR code
      </button>
      {open && (
        <Modal title={`Add items to ${jobCardCode}`} onClose={close}>
          <div className="space-y-3">
            <LiveQrScanner
              onDetect={onDetect}
              paused={!!part || looking}
              hint={looking ? "Looking up the item…" : "Point the camera at an item's QR code."}
              unknownMessage="This is not an inventory item QR code."
            />
            {part && (
              <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm">
                <p>
                  <b className="font-mono">{part.partNo}</b> {part.name}
                  <span className="block text-xs text-gray-600">
                    In stock: {formatQty(part.qtyOnHand)} {part.unit}
                    {!part.active && " · inactive item"}
                  </span>
                </p>
                <div className="flex items-end gap-2">
                  <div className="w-28">
                    <label className="label" htmlFor="qr-qty">Quantity ({part.unit})</label>
                    <input id="qr-qty" className="input" type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
                  </div>
                  <button className="btn btn-primary" onClick={add} disabled={busy || !(amount > 0) || short || !part.active}>
                    <PackagePlus className="h-4 w-4" /> {busy ? "Adding…" : "Add"}
                  </button>
                  <button className="btn" onClick={() => setPart(null)} disabled={busy}>Skip</button>
                </div>
                {short && <Alert kind="warning">Not enough in stock: only {formatQty(part.qtyOnHand)} {part.unit} left. Receive the stock first (Inventory), or add less.</Alert>}
              </div>
            )}
            {error && <Alert>{error}</Alert>}
            {added.length > 0 && (
              <div className="text-sm">
                <p className="font-medium text-green-800">Added to this job card:</p>
                <ul className="list-disc pl-5 text-gray-700">
                  {added.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            <button className="btn w-full" onClick={close}>Done</button>
          </div>
        </Modal>
      )}
    </>
  );
}
