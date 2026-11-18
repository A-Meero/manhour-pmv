"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";

const MAX_SIDE = 2400;

/** Shrinks large phone photos before upload (keeps them readable, well under the size limits). */
async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not process the photo."))), "image/jpeg", 0.88),
    );
  } catch {
    // e.g. HEIC on browsers that cannot decode it
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
    throw new Error("This photo format is not supported. Please use JPG or PNG (on iPhone: Settings › Camera › Formats › Most Compatible).");
  }
}

export function ScanUpload() {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handle(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const image = await prepareImage(file);
      setPreview(URL.createObjectURL(image));
      const form = new FormData();
      form.append("image", image, "sheet.jpg");
      const result = await api<{ id: string }>("/api/scans", { body: form });
      router.push(`/records/scan/${result.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    } finally {
      if (camera.current) camera.current.value = "";
      if (gallery.current) gallery.current.value = "";
    }
  }

  return (
    <div className="card p-5">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      {busy ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="Sheet" className="max-h-64 rounded border border-gray-200" />}
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
          <p className="text-sm text-gray-600">Reading the sheet… this can take up to a minute.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="btn btn-primary flex-1 py-4 text-base" onClick={() => camera.current?.click()}>
            <Camera className="h-5 w-5" /> Take photo
          </button>
          <button className="btn flex-1 py-4 text-base" onClick={() => gallery.current?.click()}>
            <ImagePlus className="h-5 w-5" /> Choose a photo
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">Tips: lay the sheet flat, fill the frame with the page, avoid shadows and glare.</p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </div>
  );
}
