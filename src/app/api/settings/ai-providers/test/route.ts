import { NextResponse } from "next/server";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { loadProviders, notReadyReason, resolve } from "@/lib/ai-providers";
import { testProvider } from "@/lib/ai-vision";

/** Sends a tiny text request with a saved provider's key, model and base URL. */
export const POST = withUser(async (request) => {
  const body = await readJson<{ id?: string }>(request);
  const saved = (await loadProviders()).find((p) => p.id === body.id);
  if (!saved) throw new HttpError(404, "Save the provider first, then test it.");
  const provider = resolve(saved);
  const problem = notReadyReason(provider);
  if (problem) throw new HttpError(400, `${provider.name}: ${problem}.`);
  try {
    await testProvider(provider);
  } catch (error) {
    throw new HttpError(400, `${provider.name}: ${error instanceof Error ? error.message : "test failed"}`);
  }
  return NextResponse.json({
    ok: true,
    message: `${provider.name} is connected (${provider.model}).${provider.enabled ? "" : " It is disabled, so it won't be used until you enable it."}`,
  });
}, canManageMasterData);
