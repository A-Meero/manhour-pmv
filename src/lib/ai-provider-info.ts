/** Provider names and defaults, shared by the server and the Settings screen. */

export const PROVIDER_TYPES = ["anthropic", "gemini", "qwen", "openai"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_INFO: Record<
  ProviderType,
  { label: string; defaultBaseUrl: string; modelHint: string; keyHint: string; keyRequired: boolean }
> = {
  anthropic: {
    label: "Claude (Anthropic)",
    defaultBaseUrl: "https://api.anthropic.com",
    modelHint: "e.g. claude-sonnet-5-5",
    keyHint: "Create a key at console.anthropic.com",
    keyRequired: true,
  },
  gemini: {
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    modelHint: "e.g. gemini-flash-latest (a model ID from ai.google.dev/gemini-api/docs/models, not a plan name)",
    keyHint: "Create a key at aistudio.google.com",
    keyRequired: true,
  },
  qwen: {
    label: "Qwen (Alibaba Cloud)",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    modelHint: "e.g. qwen-vl-max (must be a vision model)",
    keyHint: "Create a key in Alibaba Cloud Model Studio (DashScope)",
    keyRequired: true,
  },
  openai: {
    label: "OpenAI-compatible API",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelHint: "e.g. gpt-4o-mini, or a local vision model name",
    keyHint: "Leave empty for local servers that need no key (Ollama, LM Studio)",
    keyRequired: false,
  },
};

export const DEFAULT_TIMEOUT_SECONDS = 90;

/** What the Settings screen receives: never the key itself, only a hint. */
export type PublicProvider = {
  id: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  model: string;
  baseUrl: string;
  timeoutSeconds: number;
  hasKey: boolean;
  keyHint: string;
  keyError: string;
};
