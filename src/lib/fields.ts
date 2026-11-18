import "server-only";

import type { FieldDefinition, FieldEntity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseDate, toIsoDate } from "@/lib/dates";

export type CustomValues = Record<string, string | number | boolean | null>;

export async function getFieldDefinitions(entity: FieldEntity, includeInactive = false) {
  return prisma.fieldDefinition.findMany({
    where: { entity, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

/** Plain-object version safe to pass to client components */
export type FieldDef = Pick<FieldDefinition, "id" | "key" | "label" | "type" | "required" | "options">;

export function toFieldDefs(fields: FieldDefinition[]): FieldDef[] {
  return fields.map(({ id, key, label, type, required, options }) => ({ id, key, label, type, required, options }));
}

/**
 * Validates and normalises custom field input. `input` may be keyed by field key or label (Excel headers).
 * Returns cleaned values plus a list of problems.
 */
export function validateCustomFields(
  fields: FieldDef[],
  input: Record<string, unknown> | null | undefined,
): { values: CustomValues; errors: string[] } {
  const values: CustomValues = {};
  const errors: string[] = [];
  const source = input ?? {};

  for (const field of fields) {
    const raw = field.key in source ? source[field.key] : source[field.label];
    const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");

    if (empty) {
      if (field.required && field.type !== "CHECKBOX") errors.push(`${field.label} is required`);
      values[field.key] = field.type === "CHECKBOX" ? false : null;
      continue;
    }

    switch (field.type) {
      case "NUMBER": {
        const parsed = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
        if (!Number.isFinite(parsed)) errors.push(`${field.label} must be a number`);
        else values[field.key] = parsed;
        break;
      }
      case "DATE": {
        const parsed = parseDate(raw);
        if (!parsed) errors.push(`${field.label} must be a valid date`);
        else values[field.key] = toIsoDate(parsed);
        break;
      }
      case "SELECT": {
        const text = String(raw).trim();
        const option = field.options.find((entry) => entry.toLowerCase() === text.toLowerCase());
        if (!option) errors.push(`${field.label} must be one of: ${field.options.join(", ")}`);
        else values[field.key] = option;
        break;
      }
      case "CHECKBOX": {
        const text = String(raw).trim().toLowerCase();
        values[field.key] = raw === true || ["yes", "y", "true", "1", "x", "✓"].includes(text);
        break;
      }
      default:
        values[field.key] = String(raw).trim();
    }
  }

  return { values, errors };
}

export function slugifyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "field";
}
