"use client";

export type ClientField = {
  id: string;
  key: string;
  label: string;
  type: "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";
  required: boolean;
  options: string[];
};

export type FieldValues = Record<string, string | number | boolean | null | undefined>;

export function CustomFieldInput({
  field,
  value,
  onChange,
  compact,
}: {
  field: ClientField;
  value: FieldValues[string];
  onChange: (value: string | boolean) => void;
  compact?: boolean;
}) {
  const className = `input ${compact ? "py-1.5" : ""}`;
  switch (field.type) {
    case "CHECKBOX":
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} aria-label={field.label} />;
    case "SELECT":
      return (
        <select className={className} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-label={field.label}>
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    case "DATE":
      return <input type="date" className={className} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-label={field.label} />;
    case "NUMBER":
      return <input type="number" step="any" className={className} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-label={field.label} />;
    default:
      return <input type="text" className={className} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} aria-label={field.label} />;
  }
}

/** Labelled inputs for a set of custom fields (used in edit modals). */
export function CustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: ClientField[];
  values: FieldValues;
  onChange: (values: FieldValues) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.id}>
          <label className="label">
            {field.label}
            {field.required && <span className="text-brand"> *</span>}
          </label>
          <CustomFieldInput field={field} value={values[field.key]} onChange={(value) => onChange({ ...values, [field.key]: value })} />
        </div>
      ))}
    </div>
  );
}

export function formatFieldValue(field: ClientField, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (field.type === "CHECKBOX") return value ? "Yes" : "No";
  if (field.type === "DATE" && typeof value === "string") {
    const [y, m, d] = value.split("-");
    return d ? `${d}/${m}/${y}` : value;
  }
  return String(value);
}
