import { NextResponse } from "next/server";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";
import {
  DEFAULT_TIMEOUT_SECONDS,
  PROVIDER_INFO,
  PROVIDER_TYPES,
  encryptKey,
  loadProviders,
  saveProviders,
  toPublic,
  type AiProvider,
  type ProviderType,
} from "@/lib/ai-providers";

type IncomingProvider = {
  id?: string;
  type?: string;
  name?: string;
  enabled?: boolean;
  model?: string;
  baseUrl?: string;
  timeoutSeconds?: number | string;
  /** New key typed by the admin; empty/undefined keeps the saved key */
  apiKey?: string;
  clearKey?: boolean;
};

/**
 * Replaces the whole provider list (its order is the priority order).
 * Saved keys are kept unless a new key is sent or clearKey is true.
 */
export const PUT = withUser(async (request, user) => {
  const body = await readJson<{ providers?: IncomingProvider[] }>(request);
  if (!Array.isArray(body.providers)) throw new HttpError(400, "Invalid provider list.");
  if (body.providers.length > 20) throw new HttpError(400, "Too many providers (maximum 20).");

  const existing = new Map((await loadProviders()).map((p) => [p.id, p]));
  const next: AiProvider[] = body.providers.map((input, index) => {
    const label = `Provider ${index + 1}`;
    if (!PROVIDER_TYPES.includes(input.type as ProviderType)) throw new HttpError(400, `${label}: unknown provider type.`);
    const type = input.type as ProviderType;
    const name = String(input.name ?? "").trim() || PROVIDER_INFO[type].label;
    const model = String(input.model ?? "").trim();
    // Model IDs never contain spaces; this catches plan names typed by mistake (e.g. "Free tier").
    if (/\s/.test(model)) {
      throw new HttpError(400, `${name}: "${model}" is not a model ID. Type the model's ID without spaces, ${PROVIDER_INFO[type].modelHint}.`);
    }
    const baseUrl = String(input.baseUrl ?? "").trim().replace(/\/+$/, "");
    if (baseUrl) {
      let url: URL;
      try {
        url = new URL(baseUrl);
      } catch {
        throw new HttpError(400, `${name}: the base URL is not a valid address.`);
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, `${name}: the base URL must start with https:// or http://.`);
    }
    const timeout = input.timeoutSeconds === undefined || input.timeoutSeconds === "" ? DEFAULT_TIMEOUT_SECONDS : Number(input.timeoutSeconds);
    if (!Number.isFinite(timeout) || timeout < 5 || timeout > 600) throw new HttpError(400, `${name}: timeout must be between 5 and 600 seconds.`);
    const previous = input.id ? existing.get(input.id) : undefined;
    const newKey = String(input.apiKey ?? "").trim();
    const apiKeyEnc = input.clearKey ? "" : newKey ? encryptKey(newKey) : previous?.apiKeyEnc ?? "";
    const enabled = !!input.enabled;
    if (enabled && !model) throw new HttpError(400, `${name}: type the model name before enabling it.`);
    if (enabled && PROVIDER_INFO[type].keyRequired && !apiKeyEnc) throw new HttpError(400, `${name}: save an API key before enabling it.`);
    return {
      id: previous?.id ?? crypto.randomUUID(),
      type,
      name,
      enabled,
      model,
      baseUrl,
      timeoutSeconds: Math.round(timeout),
      apiKeyEnc,
    };
  });

  await saveProviders(next);
  await audit(user.id, "AI_PROVIDERS_UPDATED", "Setting", "aiProviders", {
    providers: next.map((p, index) => ({
      order: index + 1,
      name: p.name,
      type: p.type,
      enabled: p.enabled,
      model: p.model,
      baseUrl: p.baseUrl,
      key: p.apiKeyEnc ? "(set)" : "(none)",
    })),
  });
  return NextResponse.json({ providers: next.map(toPublic) });
}, canManageMasterData);
