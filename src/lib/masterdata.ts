import "server-only";

import type { DataSource, ImportKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getFieldDefinitions, toFieldDefs, validateCustomFields } from "@/lib/fields";

export type ImportIssue = { row: number; value: string; reason: string; status: "skipped" | "failed" };

export type ImportSummary = {
  batchId: string | null;
  totalRows: number;
  created: number;
  skipped: number;
  failed: number;
  issues: ImportIssue[];
};

type BatchMeta = {
  source: DataSource;
  actorId?: string | null;
  apiKeyId?: string | null;
  fileName?: string;
};

/** Job card IDs and employee file numbers are compared without surrounding spaces and case. */
export function normalizeCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export async function saveImportBatch(
  kind: ImportKind,
  meta: BatchMeta,
  summary: Omit<ImportSummary, "batchId">,
): Promise<string> {
  const batch = await prisma.importBatch.create({
    data: {
      kind,
      source: meta.source,
      fileName: meta.fileName ?? "",
      totalRows: summary.totalRows,
      created: summary.created,
      skipped: summary.skipped,
      failed: summary.failed,
      issues: summary.issues as unknown as Prisma.InputJsonValue,
      createdById: meta.actorId ?? null,
      apiKeyId: meta.apiKeyId ?? null,
    },
  });
  return batch.id;
}

export type JobCardInput = { row: number; code: unknown; fields?: Record<string, unknown> };

/** Creates job cards. Existing IDs (and repeats inside the same batch) are skipped, never updated. */
export async function importJobCards(items: JobCardInput[], meta: BatchMeta, recordBatch = true): Promise<ImportSummary> {
  const fieldDefs = toFieldDefs(await getFieldDefinitions("JOB_CARD"));
  const issues: ImportIssue[] = [];
  const codes = items.map((item) => normalizeCode(item.code));
  const existing = new Set(
    (await prisma.jobCard.findMany({ where: { code: { in: codes.filter(Boolean) } }, select: { code: true } })).map(
      (card) => card.code,
    ),
  );
  const seen = new Set<string>();
  const toCreate: Prisma.JobCardCreateManyInput[] = [];

  items.forEach((item, index) => {
    const code = codes[index];
    if (!code) {
      issues.push({ row: item.row, value: "", reason: "Job card ID is empty", status: "failed" });
      return;
    }
    if (code.length > 100) {
      issues.push({ row: item.row, value: code, reason: "Job card ID is longer than 100 characters", status: "failed" });
      return;
    }
    if (existing.has(code)) {
      issues.push({ row: item.row, value: code, reason: "Job card ID already exists", status: "skipped" });
      return;
    }
    if (seen.has(code)) {
      issues.push({ row: item.row, value: code, reason: "Repeated in this import", status: "skipped" });
      return;
    }
    const { values, errors } = validateCustomFields(fieldDefs, item.fields);
    if (errors.length) {
      issues.push({ row: item.row, value: code, reason: errors.join("; "), status: "failed" });
      return;
    }
    seen.add(code);
    toCreate.push({ code, customFields: values, source: meta.source });
  });

  let created = 0;
  if (toCreate.length) {
    const result = await prisma.jobCard.createMany({ data: toCreate, skipDuplicates: true });
    created = result.count;
  }

  const summary = {
    totalRows: items.length,
    created,
    skipped: issues.filter((issue) => issue.status === "skipped").length + (toCreate.length - created),
    failed: issues.filter((issue) => issue.status === "failed").length,
    issues,
  };
  const batchId = recordBatch ? await saveImportBatch("JOB_CARDS", meta, summary) : null;
  return { batchId, ...summary };
}

export type EmployeeInput = {
  row: number;
  fileNo: unknown;
  name: unknown;
  jobTitle?: unknown;
  /** Supervisor login emails, comma/semicolon separated or an array */
  supervisors?: unknown;
  fields?: Record<string, unknown>;
};

export function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  return String(value ?? "")
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Creates employees. Existing file numbers (and repeats in the batch) are skipped, never updated. */
export async function importEmployees(items: EmployeeInput[], meta: BatchMeta, recordBatch = true): Promise<ImportSummary> {
  const fieldDefs = toFieldDefs(await getFieldDefinitions("EMPLOYEE"));
  const issues: ImportIssue[] = [];
  const fileNos = items.map((item) => normalizeCode(item.fileNo));
  const existing = new Set(
    (await prisma.employee.findMany({ where: { fileNo: { in: fileNos.filter(Boolean) } }, select: { fileNo: true } })).map(
      (employee) => employee.fileNo,
    ),
  );
  const allEmails = Array.from(new Set(items.flatMap((item) => splitList(item.supervisors).map((e) => e.toLowerCase()))));
  const users = await prisma.user.findMany({
    where: { email: { in: allEmails }, active: true },
    select: { id: true, email: true },
  });
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.id]));
  const seen = new Set<string>();
  let created = 0;

  for (const [index, item] of items.entries()) {
    const fileNo = fileNos[index];
    const name = String(item.name ?? "").trim();
    const jobTitle = String(item.jobTitle ?? "").trim();
    if (!fileNo) {
      issues.push({ row: item.row, value: name, reason: "Employee file no. is empty", status: "failed" });
      continue;
    }
    if (existing.has(fileNo)) {
      issues.push({ row: item.row, value: fileNo, reason: "Employee file no. already exists", status: "skipped" });
      continue;
    }
    if (seen.has(fileNo)) {
      issues.push({ row: item.row, value: fileNo, reason: "Repeated in this import", status: "skipped" });
      continue;
    }
    const errors: string[] = [];
    if (!name) errors.push("Employee name is required");
    const supervisorIds: string[] = [];
    for (const email of splitList(item.supervisors)) {
      const id = userByEmail.get(email.toLowerCase());
      if (!id) errors.push(`Supervisor "${email}" is not an active user`);
      else if (!supervisorIds.includes(id)) supervisorIds.push(id);
    }
    const custom = validateCustomFields(fieldDefs, item.fields);
    errors.push(...custom.errors);
    if (errors.length) {
      issues.push({ row: item.row, value: fileNo, reason: errors.join("; "), status: "failed" });
      continue;
    }
    seen.add(fileNo);
    try {
      await prisma.employee.create({
        data: {
          fileNo,
          name,
          jobTitle,
          customFields: custom.values,
          source: meta.source,
          supervisors: { create: supervisorIds.map((supervisorId) => ({ supervisorId })) },
        },
      });
      created += 1;
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        issues.push({ row: item.row, value: fileNo, reason: "Employee file no. already exists", status: "skipped" });
      } else {
        throw error;
      }
    }
  }

  const summary = {
    totalRows: items.length,
    created,
    skipped: issues.filter((issue) => issue.status === "skipped").length,
    failed: issues.filter((issue) => issue.status === "failed").length,
    issues,
  };
  const batchId = recordBatch ? await saveImportBatch("EMPLOYEES", meta, summary) : null;
  return { batchId, ...summary };
}
