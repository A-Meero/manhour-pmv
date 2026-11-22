"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Keyboard, RotateCcw, Upload } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";
import { JobCardForm, type JobCardValues } from "@/components/job-card-form";
import type { ClientField } from "@/components/custom-field-inputs";

type Draft = Omit<JobCardValues, "assetId" | "dateOut" | "customFields">;
type ReadResult = { photoPath: string; mimeType: string; draft: Draft; engine: string; warning: string; error: string };

const blank = (): JobCardValues => ({
  code: "",
  assetId: "",
  assetCode: "",
  description: "",
  plateNo: "",
  chassisNo: "",
  yearOfMake: "",
  previousReading: "",
  currentReading: "",
  dateIn: "",
  dateOut: "",
  jobType: "",
  repairAt: "",
  project: "",
  operatorName: "",
  receivedBy: "",
  createdByName: "",
  tasks: [],
  customFields: {},
});

/** Add Job Card: photograph the printed card (main way) or type it in, then review and save. */
export function JobCardNew({ fields, isAdmin }: { fields: ClientField[]; isAdmin: boolean }) {
  const [tab, setTab] = useState<"photo" | "type">("photo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReadResult | null>(null);
  const [preview, setPreview] = useState<{ url: string; pdf: boolean } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setResult(null);
    setPreview({ url: URL.createObjectURL(file), pdf: file.type === "application/pdf" || /\.pdf$/i.test(file.name) });
    try {
      const form = new FormData();
      form.append("image", file);
      setResult(await api<ReadResult>("/api/job-cards/read-photo", { body: form }));
      setFormKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setPreview(null);
    setError("");
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            ["photo", "Photo or PDF", Camera],
            ["type", "Type it in", Keyboard],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${tab === id ? "border-brand text-brand" : "border-transparent text-gray-600 hover:text-gray-900"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "type" && <JobCardForm key="typed" mode="new" initial={blank()} fields={fields} isAdmin={isAdmin} />}

      {tab === "photo" && !result && (
        <div className="card mx-auto max-w-md space-y-3 p-5 text-center">
          <button className="btn btn-primary w-full py-5 text-lg" disabled={busy} onClick={() => cameraInput.current?.click()}>
            <Camera className="h-6 w-6" /> {busy ? "Reading the card…" : "Photograph the job card"}
          </button>
          <button className="btn w-full py-3" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Upload className="h-5 w-5" /> Upload a PDF or image
          </button>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
          <input ref={fileInput} type="file" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
          <p className="text-xs text-gray-500">
            Take the photo straight on, with the whole card in the picture, or upload the card&apos;s PDF (if it has several pages, the first card is read). Only the
            printed text is read; handwriting is ignored.
          </p>
          {busy && <p className="text-sm text-gray-600">This takes a few seconds…</p>}
          {error && <Alert>{error}</Alert>}
        </div>
      )}

      {tab === "photo" && result && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
            {preview &&
              (preview.pdf ? (
                <a className="btn w-full" href={preview.url} target="_blank" rel="noreferrer">
                  <FileText className="h-4 w-4" /> Open the PDF
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt="Photo of the job card" className="w-full rounded-lg border border-gray-200" />
              ))}
            <button className="btn btn-sm" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" /> Use another photo or PDF
            </button>
          </div>
          <div className="space-y-3">
            {result.error ? (
              <Alert kind="warning">{result.error}</Alert>
            ) : (
              <Alert kind="info">
                Read by {result.engine}. Check every value against the {preview?.pdf ? "PDF" : "photo"} before saving.
                {result.warning && <span className="block text-xs">{result.warning}</span>}
              </Alert>
            )}
            <JobCardForm
              key={formKey}
              mode="new"
              initial={{ ...blank(), ...result.draft }}
              fields={fields}
              isAdmin={isAdmin}
              photoPath={result.photoPath}
            />
          </div>
        </div>
      )}
    </div>
  );
}
