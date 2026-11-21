"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Camera, Keyboard, Video, VideoOff } from "lucide-react";
import { Alert } from "@/components/ui";

/** Finds the job card ID in a scanned QR: a /jc/<ID> link (any host, so old labels still work) or a bare ID. */
export function jobCardFromQr(text: string): string | null {
  const value = text.trim();
  const link = value.match(/\/jc\/([^?#\s]+)/);
  if (link) {
    try {
      return decodeURIComponent(link[1]).trim() || null;
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(value)) return null;
  return /^[A-Za-z0-9][A-Za-z0-9 ._\-/]{0,99}$/.test(value) ? value : null;
}

const noSubscribe = () => () => {};

/** Tries a few sizes: phone photos are large, and QR codes decode best at around 1000px. */
function decodeImage(image: CanvasImageSource & { width: number; height: number }) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const longest = Math.max(image.width, image.height);
  for (const target of [1000, 1600, 700, longest]) {
    const scale = Math.min(1, target / longest);
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const found = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
    if (found?.data) return found.data;
  }
  return null;
}

async function loadImage(file: File) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall back to <img> below
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function QrScanner() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  // Phone browsers only allow the live camera on HTTPS (or localhost). False while rendering on the server.
  const liveAvailable = useSyncExternalStore(
    noSubscribe,
    () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");

  // Release the camera when leaving the page.
  useEffect(() => () => stream.current?.getTracks().forEach((track) => track.stop()), []);

  function open(code: string) {
    stopLive();
    router.push(`/jc/${encodeURIComponent(code)}`);
  }

  function handle(text: string | null) {
    if (!text) {
      setError("No QR code found in the photo. Hold the phone closer so the code fills most of the picture, and keep it sharp.");
      return;
    }
    const code = jobCardFromQr(text);
    if (!code) {
      setError("This QR code is not a job card QR.");
      return;
    }
    open(code);
  }

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const image = await loadImage(file);
      handle(decodeImage(image));
    } catch {
      setError("The photo could not be read. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function stopLive() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setLive(false);
  }

  async function startLive() {
    setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stream.current = media;
      setLive(true);
      requestAnimationFrame(() => {
        if (!video.current) return;
        video.current.srcObject = media;
        void video.current.play();
        scanFrames();
      });
    } catch {
      setError("The camera could not be opened. Allow camera access, or take a photo instead.");
    }
  }

  function scanFrames() {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const step = () => {
      const element = video.current;
      if (!stream.current || !element || !context) return;
      if (element.readyState >= 2 && element.videoWidth) {
        const scale = Math.min(1, 800 / Math.max(element.videoWidth, element.videoHeight));
        canvas.width = Math.round(element.videoWidth * scale);
        canvas.height = Math.round(element.videoHeight * scale);
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
        const code = found?.data ? jobCardFromQr(found.data) : null;
        if (code) {
          open(code);
          return;
        }
      }
      setTimeout(step, 200);
    };
    step();
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      {live ? (
        <div className="card space-y-3 p-3">
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={video} className="aspect-square w-full object-cover" playsInline muted />
            <div className="pointer-events-none absolute inset-[18%] rounded-lg border-4 border-white/80" />
          </div>
          <p className="text-center text-sm text-gray-600">Point the camera at the job card QR code.</p>
          <button className="btn w-full" onClick={stopLive}>
            <VideoOff className="h-4 w-4" /> Stop camera
          </button>
        </div>
      ) : (
        <div className="card space-y-3 p-5 text-center">
          <button className="btn btn-primary w-full py-5 text-lg" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Camera className="h-6 w-6" /> {busy ? "Reading…" : "Take a photo of the QR"}
          </button>
          <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
          {liveAvailable && (
            <button className="btn w-full" onClick={startLive}>
              <Video className="h-4 w-4" /> Use live camera
            </button>
          )}
          <p className="text-xs text-gray-500">The photo stays on your phone; only the job card number is used.</p>
        </div>
      )}

      {error && <Alert kind="warning">{error}</Alert>}

      <form
        className="card space-y-2 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const code = manual.trim();
          if (code) open(code);
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
