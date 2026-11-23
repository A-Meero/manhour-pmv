"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";

/**
 * Yellow "Upload document" block on a job card added without its document (typed in, Excel, API): the card is
 * created in Oracle first, then its PDF / photo is uploaded here. With `replace`, a small button to swap the file.
 */
export function DocumentUpload({ jobCardId, needed, canUpload, replace = false }: { jobCardId: string; needed: boolean; canUpload: boolean; replace?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      await api(`/api/job-cards/${jobCardId}/document`, { body: form });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <input ref={input} type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
  );

  if (!needed) {
    if (!replace || !canUpload) return null;
    return (
      <>
        <button className="btn btn-sm" onClick={() => input.current?.click()} disabled={busy}>
          <FileUp className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Replace document"}
        </button>
        {picker}
        {error && <Alert>{error}</Alert>}
      </>
    );
  }

  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="inline-block rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-amber-950">Upload document</span>
          <p className="mt-1 text-sm text-amber-900">
            This job card was typed in. Create it in Oracle, then upload its document (PDF or photo) here; it becomes the card&apos;s attachment.
          </p>
        </div>
        {canUpload && (
          <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>
            <FileUp className="h-4 w-4" /> {busy ? "Uploading…" : "Upload document"}
          </button>
        )}
      </div>
      {picker}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </div>
  );
}
