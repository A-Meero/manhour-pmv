/**
 * Job card types. Safe to import on the client (the form guesses the type while the user types "Repair at").
 */

export const REPAIR_TYPES = ["WORKSHOP", "ONSITE"] as const;
export type RepairTypeValue = (typeof REPAIR_TYPES)[number];

export const REPAIR_TYPE_LABEL: Record<RepairTypeValue, string> = { WORKSHOP: "Workshop", ONSITE: "Onsite" };

/** "workshop", "Workshop repair", "WORKSHOP", "onsite", "on-site", "site" → the type; anything else → null */
export function parseRepairType(value: unknown): RepairTypeValue | null {
  const text = String(value ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (!text) return null;
  if (text.startsWith("WORKSHOP")) return "WORKSHOP";
  if (text.startsWith("ONSITE") || text === "SITE" || text.startsWith("ONSITEREPAIR")) return "ONSITE";
  return null;
}

/** "Repair at" containing one of the workshop words → workshop; any other non-empty value → onsite; empty → unknown. */
export function guessRepairType(repairAt: unknown, workshopWords: string[]): RepairTypeValue | null {
  const text = String(repairAt ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!text) return null;
  return workshopWords.some((word) => word && text.includes(word.toUpperCase())) ? "WORKSHOP" : "ONSITE";
}
