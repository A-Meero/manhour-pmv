"use client";

import { api } from "@/lib/client";

/** Browser side of push notifications: service worker, permission, subscription. */

export type PushSupport = "supported" | "needs-install" | "needs-https" | "unsupported";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return "needs-https";
  const ready = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iPhone / iPad: push only works in the app added to the Home Screen
  if (isIos() && !isStandalone()) return "needs-install";
  return ready ? "supported" : "unsupported";
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

function keyToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks for permission if needed (must run from a tap), subscribes this device and tells the server. */
export async function enablePush(): Promise<"granted" | "denied" | "default" | "failed"> {
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return permission;
  return (await syncSubscription()) ? "granted" : "failed";
}

/** Makes sure this device's subscription is known to the server (permission already granted). */
export async function syncSubscription() {
  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!registration) return false;
  try {
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const { publicKey } = await api<{ publicKey: string }>("/api/push/key");
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
    }
    await api("/api/push/subscribe", { body: { subscription: subscription.toJSON() } });
    return true;
  } catch {
    return false;
  }
}

export async function disablePush() {
  const registration = await navigator.serviceWorker?.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: subscription.endpoint } }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}

export async function deviceSubscribed() {
  const registration = await navigator.serviceWorker?.getRegistration("/");
  return !!(await registration?.pushManager.getSubscription());
}

const DISMISS_KEY = "manhour-push-prompt-dismissed";
export function promptDismissed() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}
export function dismissPrompt(days = 7) {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 86400_000));
  } catch {
    // private mode: the banner simply shows again next time
  }
}
