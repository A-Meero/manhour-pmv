"use client";

import { getCsrfTokenFromBrowser } from "@/lib/csrf";

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

/** fetch wrapper for the app's own API: adds the CSRF header, sends JSON or FormData, throws ApiError. */
export async function api<T = unknown>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = options.body instanceof FormData;
  const response = await fetch(url, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers: {
      "x-csrf-token": getCsrfTokenFromBrowser(),
      ...(options.body !== undefined && !isForm ? { "content-type": "application/json" } : {}),
    },
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string; details?: unknown };
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(payload.message ?? `Request failed (${response.status})`, response.status, payload.details);
  }
  return payload as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

/** DD/MM/YYYY from an ISO date string */
export function displayDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
