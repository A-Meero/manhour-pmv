"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal } from "@/components/ui";
import { DEFAULT_TIMEOUT_SECONDS, PROVIDER_INFO, PROVIDER_TYPES, type ProviderType, type PublicProvider } from "@/lib/ai-provider-info";
import { LOGGING_METHODS, LOGGING_METHOD_INFO, type LoggingMethod } from "@/lib/logging-methods";

type GeneralValues = {
  dailyHourLimit: string;
  weeklyHourLimit: string;
  weekStartDay: string;
  methods: Record<LoggingMethod, boolean>;
  maxSessionHours: string;
  appBaseUrl: string;
};

type Field = {
  id: string;
  entity: "JOB_CARD" | "EMPLOYEE" | "RECORD";
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";
  required: boolean;
  options: string[];
  active: boolean;
  sortOrder: number;
};
type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: string;
};

const TABS = [
  { id: "general", label: "General" },
  { id: "ocr", label: "Photo reading" },
  { id: "fields", label: "Form fields" },
  { id: "api", label: "API access" },
] as const;

const ENTITY_LABEL = { RECORD: "Man-hour records", EMPLOYEE: "Employees", JOB_CARD: "Job cards" } as const;
const TYPE_LABEL = { TEXT: "Text", NUMBER: "Number", DATE: "Date", SELECT: "List (choose one)", CHECKBOX: "Yes / No" } as const;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SettingsTabs(props: {
  general: GeneralValues;
  ocr: { providers: PublicProvider[]; tesseractLanguage: string };
  fields: Field[];
  apiKeys: ApiKeyRow[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("general");
  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              tab === entry.id ? "border-brand text-brand" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {tab === "general" && <GeneralSettings initial={props.general} />}
      {tab === "ocr" && <OcrSettings initial={props.ocr} />}
      {tab === "fields" && <FieldSettings fields={props.fields} />}
      {tab === "api" && <ApiSettings keys={props.apiKeys} />}
    </div>
  );
}

function useSaver() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: "success", text: success });
      router.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, run, setMessage };
}

function GeneralSettings({ initial }: { initial: GeneralValues }) {
  const [values, setValues] = useState(initial);
  const { busy, message, run } = useSaver();
  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <div>
        <h2 className="font-semibold">Ways of logging man-hours</h2>
        <p className="mt-1 text-sm text-gray-600">
          A way that is switched off disappears from the menu and is blocked for everyone except admins.
        </p>
        <div className="mt-3 space-y-2">
          {LOGGING_METHODS.map((method) => (
            <label key={method} className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={values.methods[method]}
                onChange={(e) => setValues({ ...values, methods: { ...values.methods, [method]: e.target.checked } })}
              />
              <span>
                <span className="font-medium">{LOGGING_METHOD_INFO[method].label}</span>
                <span className="block text-gray-500">{LOGGING_METHOD_INFO[method].description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
        <div>
          <label className="label">Maximum QR session length (hours)</label>
          <input className="input" type="number" step="any" min="0.5" max="72" value={values.maxSessionHours} onChange={(e) => setValues({ ...values, maxSessionHours: e.target.value })} />
          <p className="mt-1 text-xs text-gray-500">A session still running after this is stopped automatically and flagged for review.</p>
        </div>
        <div>
          <label className="label">App address for QR codes</label>
          <input className="input" placeholder="e.g. http://192.168.1.20:3002" value={values.appBaseUrl} onChange={(e) => setValues({ ...values, appBaseUrl: e.target.value })} />
          <p className="mt-1 text-xs text-gray-500">The address phones use to open the app. Leave empty to use the address you are using now.</p>
        </div>
      </div>
      <h2 className="border-t border-gray-100 pt-4 font-semibold">Hour limits</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Daily hour limit</label>
          <input className="input" type="number" step="any" min="0" placeholder="No limit" value={values.dailyHourLimit} onChange={(e) => setValues({ ...values, dailyHourLimit: e.target.value })} />
        </div>
        <div>
          <label className="label">Weekly hour limit</label>
          <input className="input" type="number" step="any" min="0" placeholder="No limit" value={values.weeklyHourLimit} onChange={(e) => setValues({ ...values, weeklyHourLimit: e.target.value })} />
        </div>
        <div>
          <label className="label">Week starts on</label>
          <select className="input" value={values.weekStartDay} onChange={(e) => setValues({ ...values, weekStartDay: e.target.value })}>
            {DAYS.map((day, index) => (
              <option key={day} value={index}>{day}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-gray-600">
        Limits are per employee. A record&apos;s hours are spread evenly over its days (e.g. 30h from Saturday to Monday counts as 10h per day), then added to the employee&apos;s other records for that day and week. Saving is blocked when a limit would be exceeded; admins are not blocked. Leave empty for no limit.
      </p>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api("/api/settings", { method: "PUT", body: values }), "Settings saved.")}>
        Save
      </button>
    </div>
  );
}

type ProviderDraft = {
  id?: string;
  type: ProviderType;
  name: string;
  enabled: boolean;
  model: string;
  baseUrl: string;
  timeoutSeconds: number;
  apiKey?: string;
  clearKey?: boolean;
};

const toDraft = (p: PublicProvider): ProviderDraft => ({
  id: p.id,
  type: p.type,
  name: p.name,
  enabled: p.enabled,
  model: p.model,
  baseUrl: p.baseUrl,
  timeoutSeconds: p.timeoutSeconds,
});

function OcrSettings({ initial }: { initial: { providers: PublicProvider[]; tesseractLanguage: string } }) {
  const [providers, setProviders] = useState(initial.providers);
  const [editing, setEditing] = useState<{ index: number | null; draft: ProviderDraft } | null>(null);
  const [testing, setTesting] = useState("");
  const [language, setLanguage] = useState(initial.tesseractLanguage);
  const { busy, message, run, setMessage } = useSaver();

  /** Saves the whole list (its order is the priority order). */
  async function saveList(list: ProviderDraft[], success: string) {
    await run(async () => {
      const result = await api<{ providers: PublicProvider[] }>("/api/settings/ai-providers", { method: "PUT", body: { providers: list } });
      setProviders(result.providers);
    }, success);
  }

  const drafts = () => providers.map(toDraft);

  function move(index: number, delta: number) {
    const list = drafts();
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    saveList(list, "Order saved.");
  }

  function toggle(index: number) {
    const list = drafts();
    list[index] = { ...list[index], enabled: !list[index].enabled };
    saveList(list, list[index].enabled ? `${list[index].name} enabled.` : `${list[index].name} disabled.`);
  }

  function remove(index: number) {
    const provider = providers[index];
    if (!confirm(`Delete "${provider.name}"? Its saved API key is deleted too.`)) return;
    saveList(drafts().filter((_, i) => i !== index), "Provider deleted.");
  }

  async function test(provider: PublicProvider) {
    setMessage(null);
    setTesting(provider.id);
    try {
      const result = await api<{ message: string }>("/api/settings/ai-providers/test", { body: { id: provider.id } });
      setMessage({ kind: "success", text: result.message });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setTesting("");
    }
  }

  const enabledCount = providers.filter((p) => p.enabled).length;
  let order = 0;

  return (
    <div className="max-w-4xl space-y-5">
      <Alert kind="info">
        Photos of handwritten cards are read by the <b>enabled AI providers in the order below</b>. If the first one fails, times out or returns something unreadable, the next one is tried. The built-in <b>Tesseract</b> reader (offline, weak on handwriting) is always the last fallback. Users always review the rows before saving. The server needs internet access to reach online providers.
      </Alert>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      {enabledCount === 0 && <Alert kind="warning">No AI provider is enabled, so photos are read with Tesseract only.</Alert>}

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">AI providers</h3>
          <button
            className="btn btn-sm"
            disabled={busy}
            onClick={() =>
              setEditing({
                index: null,
                draft: { type: "openai", name: "", enabled: false, model: "", baseUrl: "", timeoutSeconds: DEFAULT_TIMEOUT_SECONDS },
              })
            }
          >
            <Plus className="h-3.5 w-3.5" /> Add provider
          </button>
        </div>
        {providers.length === 0 ? (
          <p className="text-sm text-gray-500">No providers. Add one to read photos with AI.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>API key</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider, index) => {
                  if (provider.enabled) order += 1;
                  return (
                    <tr key={provider.id}>
                      <td>
                        <div className="flex items-center gap-1">
                          <button className="btn btn-sm" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label="Move up">
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button className="btn btn-sm" disabled={busy || index === providers.length - 1} onClick={() => move(index, 1)} aria-label="Move down">
                            <ArrowDown className="h-3 w-3" />
                          </button>
                          <span className="ml-1 text-xs text-gray-500">{provider.enabled ? `#${order}` : "–"}</span>
                        </div>
                      </td>
                      <td>
                        {provider.name}
                        <div className="text-xs text-gray-500">{PROVIDER_INFO[provider.type].label}</div>
                      </td>
                      <td className="font-mono text-xs">{provider.model || <span className="text-gray-400">not set</span>}</td>
                      <td className="text-xs">
                        {provider.keyError ? (
                          <span className="text-red-700">{provider.keyError}</span>
                        ) : provider.hasKey ? (
                          <span className="font-mono">Saved {provider.keyHint}</span>
                        ) : PROVIDER_INFO[provider.type].keyRequired ? (
                          <span className="text-gray-400">none</span>
                        ) : (
                          <span className="text-gray-400">none (optional)</span>
                        )}
                      </td>
                      <td>{provider.enabled ? "Enabled" : "Disabled"}</td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button className="btn btn-sm" disabled={busy} onClick={() => toggle(index)}>
                            {provider.enabled ? "Disable" : "Enable"}
                          </button>
                          <button className="btn btn-sm" disabled={busy || testing === provider.id} onClick={() => test(provider)}>
                            {testing === provider.id ? "Testing…" : "Test"}
                          </button>
                          <button className="btn btn-sm" disabled={busy} onClick={() => setEditing({ index, draft: toDraft(provider) })}>
                            Edit
                          </button>
                          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => remove(index)} aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card space-y-3 p-4">
        <h3 className="font-semibold">Tesseract (offline fallback)</h3>
        <div className="max-w-xs">
          <label className="label">Tesseract language</label>
          <input className="input font-mono" value={language} onChange={(e) => setLanguage(e.target.value)} />
        </div>
        <button className="btn" disabled={busy} onClick={() => run(() => api("/api/settings", { method: "PUT", body: { tesseractLanguage: language } }), "Saved.")}>
          Save
        </button>
      </div>

      {editing && (
        <ProviderForm
          draft={editing.draft}
          saved={editing.index === null ? null : providers[editing.index]}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const list = drafts();
            if (editing.index === null) list.push(draft);
            else list[editing.index] = draft;
            await saveList(list, `${draft.name || PROVIDER_INFO[draft.type].label} saved.`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProviderForm({
  draft: initialDraft,
  saved,
  busy,
  onClose,
  onSave,
}: {
  draft: ProviderDraft;
  saved: PublicProvider | null;
  busy: boolean;
  onClose: () => void;
  onSave: (draft: ProviderDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ProviderDraft>({ ...initialDraft, apiKey: "", clearKey: false });
  const info = PROVIDER_INFO[draft.type];
  const set = (patch: Partial<ProviderDraft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <Modal title={saved ? `Edit ${saved.name}` : "Add AI provider"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Provider type</label>
          <select className="input" value={draft.type} disabled={!!saved} onChange={(e) => set({ type: e.target.value as ProviderType })}>
            {PROVIDER_TYPES.map((type) => (
              <option key={type} value={type}>{PROVIDER_INFO[type].label}</option>
            ))}
          </select>
          {saved && <p className="mt-1 text-xs text-gray-500">The type cannot be changed. Add a new provider instead.</p>}
        </div>
        <div>
          <label className="label">Display name</label>
          <input className="input" value={draft.name} placeholder={info.label} onChange={(e) => set({ name: e.target.value })} />
          <p className="mt-1 text-xs text-gray-500">Shown on the review screen, e.g. &quot;DeepSeek&quot; or &quot;Local Ollama&quot;.</p>
        </div>
        <div>
          <label className="label">Model name *</label>
          <input className="input font-mono" value={draft.model} placeholder={info.modelHint} onChange={(e) => set({ model: e.target.value })} />
          <p className="mt-1 text-xs text-gray-500">Type it exactly as the provider names it. It must accept images.</p>
        </div>
        <div>
          <label className="label">API key{info.keyRequired ? " *" : ""}</label>
          <input
            className="input font-mono"
            type="password"
            autoComplete="off"
            value={draft.apiKey ?? ""}
            disabled={draft.clearKey}
            placeholder={saved?.hasKey ? `Saved (${saved.keyHint || "unreadable"}) — type a new key to replace it` : ""}
            onChange={(e) => set({ apiKey: e.target.value })}
          />
          <p className="mt-1 text-xs text-gray-500">{info.keyHint}. Keys are stored encrypted and never shown again.</p>
          {saved?.hasKey && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!draft.clearKey} onChange={(e) => set({ clearKey: e.target.checked, apiKey: "" })} /> Remove the saved key
            </label>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div>
            <label className="label">Base URL</label>
            <input className="input font-mono text-xs" value={draft.baseUrl} placeholder={info.defaultBaseUrl} onChange={(e) => set({ baseUrl: e.target.value })} />
            <p className="mt-1 text-xs text-gray-500">
              {draft.type === "openai"
                ? "The address ending in /v1, e.g. https://api.deepseek.com/v1 or http://localhost:11434/v1 (Ollama). Leave empty for OpenAI."
                : draft.type === "qwen"
                  ? "Leave empty for the international endpoint. Mainland China accounts: https://dashscope.aliyuncs.com/compatible-mode/v1"
                  : "Leave empty to use the default."}
            </p>
          </div>
          <div>
            <label className="label">Timeout (s)</label>
            <input className="input" type="number" min={5} max={600} value={draft.timeoutSeconds} onChange={(e) => set({ timeoutSeconds: Number(e.target.value) })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Enabled
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !draft.model.trim()} onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FieldSettings({ fields }: { fields: Field[] }) {
  const { message, run } = useSaver();
  const [adding, setAdding] = useState<Field["entity"] | null>(null);
  const [editing, setEditing] = useState<Field | null>(null);

  function move(list: Field[], index: number, delta: number) {
    const target = list[index + delta];
    const current = list[index];
    if (!target) return;
    run(async () => {
      await api(`/api/fields/${current.id}`, { method: "PATCH", body: { sortOrder: target.sortOrder } });
      await api(`/api/fields/${target.id}`, { method: "PATCH", body: { sortOrder: current.sortOrder } });
    }, "Order updated.");
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Add your own fields to records, employees and job cards. They appear in the entry forms, tables, Excel templates and exports. The standard fields of the sheet are always included.
      </p>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      {(Object.keys(ENTITY_LABEL) as Field["entity"][]).map((entity) => {
        const list = fields.filter((field) => field.entity === entity).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
        return (
          <div key={entity} className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">{ENTITY_LABEL[entity]}</h3>
              <button className="btn btn-sm" onClick={() => setAdding(entity)}>
                <Plus className="h-3.5 w-3.5" /> Add field
              </button>
            </div>
            {list.length === 0 ? (
              <p className="text-sm text-gray-500">No custom fields.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Required</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((field, index) => (
                      <tr key={field.id}>
                        <td>
                          <div className="flex gap-1">
                            <button className="btn btn-sm" disabled={index === 0} onClick={() => move(list, index, -1)} aria-label="Move up">
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button className="btn btn-sm" disabled={index === list.length - 1} onClick={() => move(list, index, 1)} aria-label="Move down">
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td>
                          {field.label}
                          {field.type === "SELECT" && <div className="text-xs text-gray-500">{field.options.join(", ")}</div>}
                        </td>
                        <td>{TYPE_LABEL[field.type]}</td>
                        <td>{field.required ? "Yes" : "No"}</td>
                        <td>{field.active ? "Shown" : "Hidden"}</td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <button className="btn btn-sm" onClick={() => setEditing(field)}>Edit</button>
                            <button
                              className="btn btn-sm"
                              onClick={() => run(() => api(`/api/fields/${field.id}`, { method: "PATCH", body: { active: !field.active } }), field.active ? "Field hidden." : "Field shown.")}
                            >
                              {field.active ? "Hide" : "Show"}
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              aria-label="Delete"
                              onClick={() =>
                                confirm(`Delete the field "${field.label}"? Values already entered will no longer be shown.`) &&
                                run(() => api(`/api/fields/${field.id}`, { method: "DELETE" }), "Field deleted.")
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {(adding || editing) && (
        <FieldForm
          entity={adding ?? editing!.entity}
          field={editing}
          onClose={() => {
            setAdding(null);
            setEditing(null);
          }}
          onSave={(body) =>
            run(
              () => (editing ? api(`/api/fields/${editing.id}`, { method: "PATCH", body }) : api("/api/fields", { body: { ...body, entity: adding } })),
              "Field saved.",
            )
          }
        />
      )}
    </div>
  );
}

function FieldForm({
  entity,
  field,
  onClose,
  onSave,
}: {
  entity: Field["entity"];
  field: Field | null;
  onClose: () => void;
  onSave: (body: { label: string; type: Field["type"]; required: boolean; options: string[] }) => Promise<void>;
}) {
  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState<Field["type"]>(field?.type ?? "TEXT");
  const [required, setRequired] = useState(field?.required ?? false);
  const [options, setOptions] = useState((field?.options ?? []).join("\n"));
  return (
    <Modal title={`${field ? "Edit" : "Add"} field — ${ENTITY_LABEL[entity]}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Field name *</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as Field["type"])} disabled={!!field}>
            {Object.entries(TYPE_LABEL).map(([value, text]) => (
              <option key={value} value={value}>{text}</option>
            ))}
          </select>
          {field && <p className="mt-1 text-xs text-gray-500">The type cannot be changed after creation.</p>}
        </div>
        {type === "SELECT" && (
          <div>
            <label className="label">Options (one per line)</label>
            <textarea className="input min-h-24" value={options} onChange={(e) => setOptions(e.target.value)} />
          </div>
        )}
        {type !== "CHECKBOX" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!label.trim()}
            onClick={async () => {
              await onSave({ label, type, required, options: options.split("\n").map((o) => o.trim()).filter(Boolean) });
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ApiSettings({ keys }: { keys: ApiKeyRow[] }) {
  const { busy, message, run } = useSaver();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["JOB_CARDS"]);
  const [newKey, setNewKey] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-5">
      <div className="card space-y-3 p-5">
        <h3 className="font-semibold">Create an API key</h3>
        <p className="text-sm text-gray-600">Give a key to the system that creates job cards (or employees) so it can send them here automatically.</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} placeholder="e.g. Job card system" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-4 pb-2 text-sm">
            {[
              ["JOB_CARDS", "Job cards"],
              ["EMPLOYEES", "Employees"],
            ].map(([value, text]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="checkbox" checked={scopes.includes(value)} onChange={(e) => setScopes(e.target.checked ? [...scopes, value] : scopes.filter((s) => s !== value))} />
                {text}
              </label>
            ))}
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || !name.trim() || scopes.length === 0}
            onClick={() =>
              run(async () => {
                const result = await api<{ key: string }>("/api/api-keys", { body: { name, scopes } });
                setNewKey(result.key);
                setName("");
              }, "Key created.")
            }
          >
            Create
          </button>
        </div>
        {newKey && (
          <Alert kind="warning">
            Copy this key now; it will not be shown again:
            <div className="mt-2 flex items-center gap-2">
              <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">{newKey}</code>
              <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(newKey)}>
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </Alert>
        )}
        {message && !newKey && <Alert kind={message.kind}>{message.text}</Alert>}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Allowed</th>
              <th>Last used</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500">No API keys yet.</td>
              </tr>
            )}
            {keys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td className="font-mono text-xs">{key.prefix}…</td>
                <td>{key.scopes.map((scope) => (scope === "JOB_CARDS" ? "Job cards" : "Employees")).join(", ")}</td>
                <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</td>
                <td>{key.active ? "Active" : "Disabled"}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button className="btn btn-sm" onClick={() => run(() => api(`/api/api-keys/${key.id}`, { method: "PATCH", body: { active: !key.active } }), "Updated.")}>
                      {key.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => confirm(`Delete the key "${key.name}"?`) && run(() => api(`/api/api-keys/${key.id}`, { method: "DELETE" }), "Key deleted.")}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card space-y-2 p-5 text-sm">
        <h3 className="font-semibold">How the other system sends data</h3>
        <p className="text-gray-600">Send the key in the <code>Authorization: Bearer &lt;key&gt;</code> header. Existing IDs are skipped. The response lists what was created, skipped or invalid.</p>
        <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-100">{`POST ${origin}/api/v1/job-cards
["JC-1001", "JC-1002"]

POST ${origin}/api/v1/employees
{ "employees": [ { "fileNo": "1023", "name": "Ali Hassan",
    "jobTitle": "Electrician", "supervisorEmails": ["sup@ahmadiah.com"] } ] }`}</pre>
        <p className="text-xs text-gray-500">The final format will be adjusted once the job card system&apos;s API is defined.</p>
      </div>
    </div>
  );
}
