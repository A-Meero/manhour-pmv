import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { appConfig } from "@/lib/env";
import { DEFAULT_TIMEOUT_SECONDS, PROVIDER_INFO, PROVIDER_TYPES, type ProviderType, type PublicProvider } from "@/lib/ai-provider-info";

/**
 * AI providers used to read photographed time cards.
 * Stored as one JSON value in the Setting table (key "aiProviders"); API keys are encrypted with AUTH_SECRET.
 * Providers are tried in list order; Tesseract is always the last fallback.
 */

export { DEFAULT_TIMEOUT_SECONDS, PROVIDER_INFO, PROVIDER_TYPES } from "@/lib/ai-provider-info";
export type { ProviderType, PublicProvider } from "@/lib/ai-provider-info";

export type AiProvider = {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  model: string;
  /** Empty = the type's default base URL */
  baseUrl: string;
  timeoutSeconds: number;
  /** Encrypted ("v1:…"), or "" when no key is saved */
  apiKeyEnc: string;
};

/** A provider ready to call, with its key decrypted. Server-only; never send to the browser. */
export type ResolvedProvider = Omit<AiProvider, "apiKeyEnc"> & { apiKey: string; keyError: string };

const SETTING_KEY = "aiProviders";

// ---------- encryption ----------

function cipherKey() {
  return createHash("sha256").update(`manhour-ai-keys:${appConfig.authSecret()}`).digest();
}

export function encryptKey(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cipherKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function decryptKey(stored: string): { key: string; error: string } {
  if (!stored) return { key: "", error: "" };
  try {
    if (!stored.startsWith("v1:")) throw new Error("unknown format");
    const raw = Buffer.from(stored.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", cipherKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return { key: Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"), error: "" };
  } catch {
    return { key: "", error: "The saved key cannot be read (AUTH_SECRET may have changed). Enter the key again." };
  }
}

// ---------- load / save ----------

function clean(input: Partial<AiProvider>): AiProvider | null {
  const type = PROVIDER_TYPES.includes(input.type as ProviderType) ? (input.type as ProviderType) : null;
  if (!type) return null;
  const timeout = Number(input.timeoutSeconds);
  return {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    type,
    name: String(input.name ?? "").trim() || PROVIDER_INFO[type].label,
    enabled: !!input.enabled,
    model: String(input.model ?? "").trim(),
    baseUrl: String(input.baseUrl ?? "").trim().replace(/\/+$/, ""),
    timeoutSeconds: Number.isFinite(timeout) && timeout >= 5 && timeout <= 600 ? Math.round(timeout) : DEFAULT_TIMEOUT_SECONDS,
    apiKeyEnc: typeof input.apiKeyEnc === "string" ? input.apiKeyEnc : "",
  };
}

/** Starting list when nothing is saved yet: one disabled entry per built-in provider. */
function starterList(): AiProvider[] {
  return (["anthropic", "gemini", "qwen"] as const).map((type) => ({
    id: randomUUID(),
    type,
    name: PROVIDER_INFO[type].label,
    enabled: false,
    model: type === "anthropic" ? "claude-sonnet-5-5" : "",
    baseUrl: "",
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    apiKeyEnc: "",
  }));
}

export async function loadProviders(): Promise<AiProvider[]> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [SETTING_KEY, "claudeApiKey", "claudeModel"] } } });
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  if (map[SETTING_KEY]) {
    try {
      const parsed = JSON.parse(map[SETTING_KEY]) as Partial<AiProvider>[];
      if (Array.isArray(parsed)) return parsed.map(clean).filter((p): p is AiProvider => p !== null);
    } catch {
      console.error("aiProviders setting is not valid JSON; starting from an empty list");
    }
  }
  // First run after the upgrade: carry over the old single Claude key/model.
  const list = starterList();
  if (map.claudeApiKey) {
    list[0].enabled = true;
    list[0].apiKeyEnc = encryptKey(map.claudeApiKey);
    if (map.claudeModel) list[0].model = map.claudeModel;
  }
  // Save straight away so the provider IDs stay the same between page loads.
  await saveProviders(list);
  return list;
}

export async function saveProviders(list: AiProvider[]) {
  const value = JSON.stringify(list.map((p) => clean(p)).filter(Boolean));
  await prisma.$transaction([
    prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } }),
    // The old plain-text Claude key is no longer used once the list is saved.
    prisma.setting.deleteMany({ where: { key: { in: ["claudeApiKey", "claudeModel"] } } }),
  ]);
}

export function resolve(provider: AiProvider): ResolvedProvider {
  const { apiKeyEnc, ...rest } = provider;
  const { key, error } = decryptKey(apiKeyEnc);
  return { ...rest, baseUrl: provider.baseUrl || PROVIDER_INFO[provider.type].defaultBaseUrl, apiKey: key, keyError: error };
}

export function toPublic(provider: AiProvider): PublicProvider {
  const { apiKeyEnc, ...rest } = provider;
  const { key, error } = decryptKey(apiKeyEnc);
  return { ...rest, hasKey: !!apiKeyEnc, keyHint: key ? `…${key.slice(-4)}` : "", keyError: error };
}

/** Why a provider can't be used right now, or "" if it's ready. */
export function notReadyReason(provider: ResolvedProvider): string {
  if (!provider.model) return "no model name is set";
  if (provider.keyError) return provider.keyError;
  if (PROVIDER_INFO[provider.type].keyRequired && !provider.apiKey) return "no API key is saved";
  return "";
}

/** Enabled, fully configured providers in priority order. */
export async function activeProviders(): Promise<ResolvedProvider[]> {
  return (await loadProviders())
    .filter((p) => p.enabled)
    .map(resolve)
    .filter((p) => !notReadyReason(p));
}
