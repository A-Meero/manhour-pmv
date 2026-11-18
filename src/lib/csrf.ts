export const CSRF_COOKIE_NAME = "manhour_csrf";

export function createCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function readCookie(header: string | null | undefined, name: string): string {
  if (!header) return "";
  const match = header
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

/** Double-submit check: header token must equal cookie token for state-changing requests. */
export function validateCsrf(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  const cookieToken = readCookie(request.headers.get("cookie"), CSRF_COOKIE_NAME);
  const headerToken = request.headers.get("x-csrf-token")?.trim() ?? "";
  return !!cookieToken && cookieToken === headerToken;
}

export function getCsrfTokenFromBrowser(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1] || "") : "";
}
