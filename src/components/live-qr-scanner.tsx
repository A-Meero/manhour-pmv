"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import jsQR from "jsqr";
import { Camera, Flashlight, FlashlightOff, RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui";

/** The browser's own QR reader (Chrome / Edge on Android, Safari 17+); not in TypeScript's DOM types yet. */
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorClass = { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

const noSubscribe = () => () => {};

/** Tries a few sizes: phone photos are large, and QR codes decode best at around 1000px. */
export function decodeImage(image: CanvasImageSource & { width: number; height: number }) {
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

async function makeDetector(): Promise<Detector | null> {
  const Klass = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!Klass) return null;
  try {
    const formats = (await Klass.getSupportedFormats?.()) ?? ["qr_code"];
    return formats.includes("qr_code") ? new Klass({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

/**
 * Opens the camera straight away and watches for a QR code. Every code seen is passed to `onDetect`;
 * returning true means "this is one of ours" (the scanner then waits while `paused` is true, and ignores the same
 * code for a moment afterwards). Returning false shows `unknownMessage` and keeps scanning.
 * Where the live camera can't be used (plain http, no permission) it falls back to taking a photo.
 */
export function LiveQrScanner({
  onDetect,
  paused = false,
  hint = "Point the camera at the QR code.",
  unknownMessage = "This QR code is not one of this app's codes.",
}: {
  onDetect: (text: string) => boolean;
  paused?: boolean;
  hint?: string;
  unknownMessage?: string;
}) {
  // Phone browsers only allow the live camera on HTTPS (or localhost). False while rendering on the server.
  const liveAvailable = useSyncExternalStore(
    noSubscribe,
    () => window.isSecureContext && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const onDetectRef = useRef(onDetect);
  const pausedRef = useRef(paused);
  const lastAccepted = useRef<{ text: string; until: number }>({ text: "", until: 0 });
  const [state, setState] = useState<"starting" | "live" | "failed">("starting");
  const [torch, setTorch] = useState<boolean | null>(null);
  const [warning, setWarning] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);
  useEffect(() => {
    // Leaving the paused state: give the person time to move the code away before it counts again.
    if (pausedRef.current && !paused) lastAccepted.current.until = Date.now() + 2500;
    pausedRef.current = paused;
  }, [paused]);

  function handle(text: string) {
    const now = Date.now();
    if (text === lastAccepted.current.text && now < lastAccepted.current.until) return false;
    if (onDetectRef.current(text)) {
      lastAccepted.current = { text, until: now + 2500 };
      setWarning("");
      navigator.vibrate?.(80);
      return true;
    }
    setWarning(unknownMessage);
    return false;
  }

  useEffect(() => {
    if (!liveAvailable) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    async function start() {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            // Continuous autofocus where the phone supports it (ignored elsewhere)
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          },
        });
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        const element = video.current;
        if (!element) return;
        element.srcObject = media;
        await element.play().catch(() => undefined);
        const track = media.getVideoTracks()[0];
        const capabilities = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch(capabilities.torch ? false : null);
        setState("live");
        const detector = await makeDetector();
        const step = async () => {
          if (cancelled) return;
          if (!pausedRef.current && element.readyState >= 2 && element.videoWidth) {
            let text: string | null = null;
            if (detector) {
              try {
                text = (await detector.detect(element))[0]?.rawValue ?? null;
              } catch {
                text = null;
              }
            } else if (context) {
              // jsQR: the middle of the frame at up to 960px is quick to read and plenty sharp
              const size = Math.min(element.videoWidth, element.videoHeight);
              const scale = Math.min(1, 960 / size);
              canvas.width = Math.round(size * scale);
              canvas.height = Math.round(size * scale);
              context.drawImage(element, (element.videoWidth - size) / 2, (element.videoHeight - size) / 2, size, size, 0, 0, canvas.width, canvas.height);
              const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
            }
            if (text && !cancelled) handle(text);
          }
          timer = setTimeout(step, detector ? 120 : 180);
        };
        void step();
      } catch {
        if (!cancelled) setState("failed");
      }
    }
    void start();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
    // `handle` reads its inputs through refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAvailable, attempt]);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  }

  async function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setWarning("");
    try {
      const text = decodeImage(await loadImage(file));
      if (!text) setWarning("No QR code found in the photo. Hold the phone closer so the code fills most of the picture, and keep it sharp.");
      else handle(text);
    } catch {
      setWarning("The photo could not be read. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const live = liveAvailable && state !== "failed";

  return (
    <div className="space-y-3">
      {live ? (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={video} className="aspect-square w-full object-cover" playsInline muted autoPlay />
          <div className={`pointer-events-none absolute inset-[15%] rounded-xl border-4 ${paused ? "border-green-400" : "border-white/80"}`} />
          {state === "starting" && <p className="absolute inset-x-0 top-1/2 text-center text-sm text-white">Opening the camera…</p>}
          {torch !== null && (
            <button
              type="button"
              className="absolute bottom-3 right-3 rounded-full bg-black/60 p-3 text-white"
              aria-label={torch ? "Turn the light off" : "Turn the light on"}
              onClick={toggleTorch}
            >
              {torch ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4 text-center">
          {liveAvailable ? (
            <Alert kind="warning">
              The camera could not be opened. Allow camera access for this site, then{" "}
              <button type="button" className="underline" onClick={() => { setState("starting"); setAttempt((n) => n + 1); }}>
                <RefreshCw className="inline h-3.5 w-3.5" /> try again
              </button>
              , or take a photo instead.
            </Alert>
          ) : (
            <p className="text-xs text-gray-500">The live camera needs the app to be opened over https. Take a photo of the QR instead.</p>
          )}
          <button type="button" className="btn btn-primary w-full py-4" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Camera className="h-5 w-5" /> {busy ? "Reading…" : "Take a photo of the QR"}
          </button>
          <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
        </div>
      )}
      {live && <p className="text-center text-sm text-gray-600">{hint}</p>}
      {warning && <Alert kind="warning">{warning}</Alert>}
    </div>
  );
}
