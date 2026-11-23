import "server-only";

import QRCode from "qrcode";
import { headers } from "next/headers";
import { getSettings } from "@/lib/settings";

/**
 * QR codes hold plain links (/jc/<job card>, /a/<asset>, /p/<part no.>), so any phone camera can open them.
 * The address comes from Settings › General › App address; otherwise from the address the admin is using now.
 */
export async function appOrigin(request?: Request) {
  const { appBaseUrl } = await getSettings();
  if (appBaseUrl) return appBaseUrl;
  if (request) return new URL(request.url).origin;
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3002";
  const proto = list.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export function jobCardLink(origin: string, code: string) {
  return `${origin}/jc/${encodeURIComponent(code)}`;
}

export function assetLink(origin: string, code: string) {
  return `${origin}/a/${encodeURIComponent(code)}`;
}

export function partLink(origin: string, partNo: string) {
  return `${origin}/p/${encodeURIComponent(partNo)}`;
}

export function qrPng(text: string, width = 600) {
  return QRCode.toBuffer(text, { type: "png", errorCorrectionLevel: "M", margin: 2, width });
}

export function qrDataUrl(text: string, width = 320) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 2, width });
}
