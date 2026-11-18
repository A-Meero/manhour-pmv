"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal } from "@/components/ui";

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
  { id: "general", label: "Hours & week" },
  { id: "ocr", label: "Photo reading" },
  { id: "fields", label: "Form fields" },
  { id: "api", label: "API access" },
] as const;

const ENTITY_LABEL = { RECORD: "Man-hour records", EMPLOYEE: "Employees", JOB_CARD: "Job cards" } as const;
const TYPE_LABEL = { TEXT: "Text", NUMBER: "Number", DATE: "Date", SELECT: "List (choose one)", CHECKBOX: "Yes / No" } as const;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SettingsTabs(props: {
  general: { dailyHourLimit: string; weeklyHourLimit: string; weekStartDay: string };
  ocr: { hasClaudeKey: boolean; claudeKeyHint: string; claudeModel: string; tesseractLanguage: string };
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

function GeneralSettings({ initial }: { initial: { dailyHourLimit: string; weeklyHourLimit: string; weekStartDay: string } }) {
  const [values, setValues] = useState(initial);
  const { busy, message, run } = useSaver();
  return (
    <div className="card max-w-2xl space-y-4 p-5">
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

function OcrSettings({ initial }: { initial: { hasClaudeKey: boolean; claudeKeyHint: string; claudeModel: string; tesseractLanguage: string } }) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.claudeModel);
  const [language, setLanguage] = useState(initial.tesseractLanguage);
  const { busy, message, run, setMessage } = useSaver();

  async function test() {
    setMessage(null);
    try {
      const result = await api<{ message: string }>("/api/settings/test-claude", { method: "POST" });
      setMessage({ kind: "success", text: result.message });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    }
  }

  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <Alert kind="info">
        Photos of handwritten sheets are read with the <b>Claude API</b> when a key is saved here. Without a key (or if Claude cannot be reached) the built-in <b>Tesseract</b> reader is used; it works offline but often misreads handwriting. Users always review the rows before saving.
      </Alert>
      <div>
        <label className="label">Claude API key</label>
        <input
          className="input font-mono"
          type="password"
          autoComplete="off"
          value={apiKey}
          placeholder={initial.hasClaudeKey ? `Saved (${initial.claudeKeyHint}) — type a new key to replace it` : "sk-ant-…"}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">Create a key at console.anthropic.com. The server needs internet access to use it.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Claude model</label>
          <input className="input font-mono" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <label className="label">Tesseract language</label>
          <input className="input font-mono" value={language} onChange={(e) => setLanguage(e.target.value)} />
        </div>
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api("/api/settings", { method: "PUT", body: { claudeApiKey: apiKey, claudeModel: model, tesseractLanguage: language } });
              setApiKey("");
            }, "Saved.")
          }
        >
          Save
        </button>
        {initial.hasClaudeKey && (
          <>
            <button className="btn" onClick={test}>Test connection</button>
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() => confirm("Remove the Claude API key? Photos will be read with Tesseract.") && run(() => api("/api/settings", { method: "PUT", body: { clearClaudeApiKey: true } }), "Key removed. Tesseract will be used.")}
            >
              Remove key
            </button>
          </>
        )}
      </div>
    </div>
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
