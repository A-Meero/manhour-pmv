/**
 * What a scanned QR code points to. Safe to import on the client.
 * The app's QR codes are plain links (any phone camera can open them):
 *   /jc/<job card no.>   job card
 *   /a/<asset code>      asset
 *   /p/<part no.>        inventory item
 * Any host is accepted, so labels printed with an older app address still work.
 */

export type QrKind = "jobcard" | "asset" | "part";
export type QrTarget = { kind: QrKind; code: string };

const PATHS: [RegExp, QrKind][] = [
  [/\/jc\/([^?#\s]+)/, "jobcard"],
  [/\/a\/([^?#\s]+)/, "asset"],
  [/\/p\/([^?#\s]+)/, "part"],
];

export const QR_KIND_LABEL: Record<QrKind, string> = { jobcard: "job card", asset: "asset", part: "inventory item" };

/**
 * Reads a scanned text. A link is recognised by its path; a bare code (no link) is taken as `bareKind`
 * when given (e.g. the job card scanner treats "JC-1001" as a job card number).
 */
export function parseQr(text: string, bareKind?: QrKind): QrTarget | null {
  const value = text.trim();
  for (const [pattern, kind] of PATHS) {
    const match = value.match(pattern);
    if (match) {
      try {
        const code = decodeURIComponent(match[1]).trim();
        return code ? { kind, code } : null;
      } catch {
        return null;
      }
    }
  }
  if (/^https?:\/\//i.test(value) || !bareKind) return null;
  return /^[A-Za-z0-9][A-Za-z0-9 ._\-/]{0,99}$/.test(value) ? { kind: bareKind, code: value } : null;
}

/** Where a scanned code opens inside the app */
export function qrHref(target: QrTarget) {
  const code = encodeURIComponent(target.code);
  return target.kind === "jobcard" ? `/jc/${code}` : target.kind === "asset" ? `/a/${code}` : `/p/${code}`;
}
