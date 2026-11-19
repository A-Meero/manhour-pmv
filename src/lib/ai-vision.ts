import "server-only";

import type { ResolvedProvider } from "@/lib/ai-providers";

/**
 * One function per API style. Each sends the prompt (and optionally an image) and returns the model's text.
 * Qwen (DashScope compatible mode) and the generic OpenAI-compatible type share the same request format.
 */

type Input = { prompt: string; image?: { data: Buffer; mimeType: string }; maxTokens: number };

async function readError(response: Response, label: string) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: string } | string; message?: string }
    | null;
  const message =
    (typeof payload?.error === "string" ? payload.error : payload?.error?.message) || payload?.message || `HTTP ${response.status}`;
  return new Error(`${label}: ${message}`);
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutSeconds: number) {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") throw new Error(`no answer within ${timeoutSeconds} seconds`);
    throw new Error(`could not reach ${new URL(url).host} (${error instanceof Error ? error.message : "network error"})`);
  }
}

async function callAnthropic(p: ResolvedProvider, input: Input) {
  const content: unknown[] = [];
  if (input.image) {
    content.push({ type: "image", source: { type: "base64", media_type: input.image.mimeType, data: input.image.data.toString("base64") } });
  }
  content.push({ type: "text", text: input.prompt });
  const response = await post(
    `${p.baseUrl}/v1/messages`,
    { "x-api-key": p.apiKey, "anthropic-version": "2023-06-01" },
    { model: p.model, max_tokens: input.maxTokens, messages: [{ role: "user", content }] },
    p.timeoutSeconds,
  );
  if (!response.ok) throw await readError(response, "API error");
  const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
  return (payload.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n");
}

async function callGemini(p: ResolvedProvider, input: Input) {
  // Accept what people commonly paste: "models/gemini-2.5-flash", or a base URL that already ends in /v1beta.
  const model = p.model.trim().replace(/^models\//, "");
  const baseUrl = p.baseUrl.replace(/\/(v1beta|v1)(\/models)?$/, "");
  const parts: unknown[] = [];
  if (input.image) parts.push({ inline_data: { mime_type: input.image.mimeType, data: input.image.data.toString("base64") } });
  parts.push({ text: input.prompt });
  const response = await post(
    `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": p.apiKey },
    // No maxOutputTokens: Gemini 2.5+ counts its hidden "thinking" tokens against that limit, so a cap
    // (e.g. 512 for the test) can be used up before any answer text is written. The model's own maximum applies.
    { contents: [{ role: "user", parts }], generationConfig: { temperature: 0 } },
    p.timeoutSeconds,
  );
  if (!response.ok) {
    const error = await readError(response, "API error");
    if (response.status === 404 || /model name format/i.test(error.message)) {
      error.message += ` — check the model name ("${model}"); use a Gemini model ID such as gemini-flash-latest.`;
    }
    throw error;
  }
  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (payload.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request (${payload.promptFeedback.blockReason})`);
  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("\n");
  if (!text.trim()) {
    const reason = candidate?.finishReason;
    throw new Error(
      reason === "MAX_TOKENS"
        ? "Gemini ran out of output tokens before writing an answer"
        : `Gemini returned no text${reason ? ` (finish reason: ${reason})` : ""}`,
    );
  }
  return text;
}

async function callOpenAiStyle(p: ResolvedProvider, input: Input) {
  const content: unknown[] = [{ type: "text", text: input.prompt }];
  if (input.image) {
    content.push({ type: "image_url", image_url: { url: `data:${input.image.mimeType};base64,${input.image.data.toString("base64")}` } });
  }
  const response = await post(
    `${p.baseUrl}/chat/completions`,
    p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {},
    { model: p.model, max_tokens: input.maxTokens, temperature: 0, messages: [{ role: "user", content }] },
    p.timeoutSeconds,
  );
  if (!response.ok) throw await readError(response, "API error");
  const payload = (await response.json()) as {
    choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
  };
  const message = payload.choices?.[0]?.message?.content;
  if (Array.isArray(message)) return message.map((part) => part.text ?? "").join("\n");
  return message ?? "";
}

export async function askProvider(provider: ResolvedProvider, input: Input): Promise<string> {
  switch (provider.type) {
    case "anthropic":
      return callAnthropic(provider, input);
    case "gemini":
      return callGemini(provider, input);
    case "qwen":
    case "openai":
      return callOpenAiStyle(provider, input);
  }
}

/** Small text-only request used by the "Test connection" button. */
export async function testProvider(provider: ResolvedProvider) {
  const text = await askProvider(provider, { prompt: "Reply with the single word OK.", maxTokens: 512 });
  if (!text.trim()) throw new Error("the API answered but returned no text");
  return text.trim().slice(0, 40);
}
