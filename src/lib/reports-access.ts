import type { CurrentUser } from "@/lib/auth/session";
import { canManageInventory, canViewCosts, isSupervisor, seesAllRecords } from "@/lib/auth/access";

/** The Excel reports and who may run them (kept apart from the report builder so the menu can use it). */
export const REPORTS = {
  "job-card-costs": { label: "Job card costs", hint: "Per job card: asset, type, dates, hours, labour, parts and total cost of the work in the period." },
  "asset-costs": { label: "Asset costs", hint: "Per asset: job cards, hours, labour, parts, total in the period, plus purchase and book value." },
  "team-hours": { label: "Team / employee hours", hint: "Per employee and job card: hours in the period, with a total per employee." },
  "parts-issued": { label: "Parts issued", hint: "Every part issued to (or returned from) a job card in the period." },
} as const;

export type ReportKind = keyof typeof REPORTS;
export const isReportKind = (value: string): value is ReportKind => value in REPORTS;

export function canRunReport(user: CurrentUser, kind: ReportKind) {
  if (kind === "job-card-costs" || kind === "asset-costs") return canViewCosts(user);
  if (kind === "team-hours") return seesAllRecords(user) || isSupervisor(user);
  return canManageInventory(user) || canViewCosts(user);
}

export const canViewReports = (user: CurrentUser) => (Object.keys(REPORTS) as ReportKind[]).some((kind) => canRunReport(user, kind));
