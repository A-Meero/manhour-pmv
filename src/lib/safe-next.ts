/** Only same-site paths are allowed as a post-login destination (no "//host" or "http://…"). */
export function safeNext(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  if (!text.startsWith("/") || text.startsWith("//") || text.startsWith("/\\")) return "/";
  if (text.startsWith("/api/") || text.startsWith("/login")) return "/";
  return text;
}
