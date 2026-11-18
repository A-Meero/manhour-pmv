import { NextResponse } from "next/server";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { getSettings } from "@/lib/settings";

/** Sends a tiny request to check the saved Claude API key and model. */
export const POST = withUser(async () => {
  const settings = await getSettings();
  if (!settings.claudeApiKey) throw new HttpError(400, "No Claude API key is saved. Photos are read with Tesseract.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": settings.claudeApiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: settings.claudeModel, max_tokens: 5, messages: [{ role: "user", content: "Reply with OK" }] }),
    signal: AbortSignal.timeout(30_000),
  }).catch((error: Error) => {
    throw new HttpError(502, `Could not reach the Claude API: ${error.message}`);
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new HttpError(400, `Claude API error: ${payload?.error?.message ?? `HTTP ${response.status}`}`);
  }
  return NextResponse.json({ ok: true, message: `Connected. Photos will be read with ${settings.claudeModel}.` });
}, canManageMasterData);
