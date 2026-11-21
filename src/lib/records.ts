import "server-only";

import { Prisma, type DataSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { getEntryScope, getViewScope, isAdmin, methodAllowed, scopeAllows } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import { LOGGING_METHOD_INFO, METHOD_FOR_SOURCE } from "@/lib/logging-methods";
import { getSettings, type AppSettings } from "@/lib/settings";
import { getFieldDefinitions, toFieldDefs, validateCustomFields, type FieldDef } from "@/lib/fields";
import { addDays, formatDate, parseDate, spreadHours, toIsoDate, weekStart } from "@/lib/dates";
import { normalizeCode, saveImportBatch, type ImportSummary } from "@/lib/masterdata";
import { audit } from "@/lib/audit";

export type RecordInput = {
  /** Row number shown in reports (sheet line, Excel row …) */
  row: number;
  employeeId?: string;
  employeeFileNo?: unknown;
  jobCardCode: unknown;
  startDate: unknown;
  endDate: unknown;
  hours: unknown;
  remarks?: unknown;
  customFields?: Record<string, unknown>;
  preparedByName?: unknown;
  preparedByDate?: unknown;
  approvedByName?: unknown;
  approvedByDate?: unknown;
};

export type RowError = { row: number; employee: string; jobCard: string; errors: string[] };

export type CreateResult = { created: number; createdIds: string[]; invalid: RowError[] };

type Options = {
  actor: CurrentUser;
  source: DataSource;
  scanId?: string | null;
  importBatchId?: string | null;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function parseHours(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  return round2(parsed);
}

/** Running per-employee, per-day hour totals used to enforce the daily/weekly limits. */
class LoadTracker {
  private load = new Map<string, Map<string, number>>();

  constructor(private settings: AppSettings) {}

  get active() {
    return this.settings.dailyHourLimit !== null || this.settings.weeklyHourLimit !== null;
  }

  /** Loads existing records for the employees around the given date window. */
  async prime(employeeIds: string[], from: Date, to: Date, excludeRecordId?: string) {
    if (!this.active || employeeIds.length === 0) return;
    const windowStart = weekStart(from, this.settings.weekStartDay);
    const windowEnd = addDays(weekStart(to, this.settings.weekStartDay), 6);
    const records = await prisma.manHourRecord.findMany({
      where: {
        employeeId: { in: employeeIds },
        startDate: { lte: windowEnd },
        endDate: { gte: windowStart },
        ...(excludeRecordId ? { id: { not: excludeRecordId } } : {}),
      },
      select: { employeeId: true, startDate: true, endDate: true, hours: true },
    });
    for (const record of records) this.add(record.employeeId, record.startDate, record.endDate, Number(record.hours));
  }

  private add(employeeId: string, start: Date, end: Date, hours: number) {
    const days = this.load.get(employeeId) ?? new Map<string, number>();
    for (const { day, hours: share } of spreadHours(start, end, hours)) {
      const key = toIsoDate(day);
      days.set(key, (days.get(key) ?? 0) + share);
    }
    this.load.set(employeeId, days);
  }

  /** Returns limit violations if this record were added; adds it when there are none. */
  tryAdd(employeeId: string, start: Date, end: Date, hours: number): string[] {
    if (!this.active) return [];
    const { dailyHourLimit, weeklyHourLimit, weekStartDay } = this.settings;
    const days = new Map(this.load.get(employeeId) ?? []);
    const spread = spreadHours(start, end, hours);
    for (const { day, hours: share } of spread) {
      const key = toIsoDate(day);
      days.set(key, (days.get(key) ?? 0) + share);
    }

    const errors: string[] = [];
    if (dailyHourLimit !== null) {
      for (const { day } of spread) {
        const total = days.get(toIsoDate(day)) ?? 0;
        if (total > dailyHourLimit + 0.001) {
          errors.push(
            `Daily limit of ${dailyHourLimit}h exceeded on ${formatDate(day)} (${round2(total)}h with this record, spread evenly over its days)`,
          );
          break;
        }
      }
    }
    if (weeklyHourLimit !== null) {
      const weeks = new Set(spread.map(({ day }) => toIsoDate(weekStart(day, weekStartDay))));
      for (const week of weeks) {
        const first = new Date(`${week}T00:00:00.000Z`);
        let total = 0;
        for (let offset = 0; offset < 7; offset += 1) total += days.get(toIsoDate(addDays(first, offset))) ?? 0;
        if (total > weeklyHourLimit + 0.001) {
          errors.push(
            `Weekly limit of ${weeklyHourLimit}h exceeded for the week ${formatDate(first)} – ${formatDate(addDays(first, 6))} (${round2(total)}h with this record)`,
          );
          break;
        }
      }
    }
    if (errors.length === 0) this.load.set(employeeId, days);
    return errors;
  }
}

export function supervisorNames(employee: { supervisors: { supervisor: { name: string } }[] }) {
  return employee.supervisors.map((entry) => entry.supervisor.name).join(", ");
}

export const employeeInclude = {
  supervisors: { include: { supervisor: { select: { name: true } } } },
} satisfies Prisma.EmployeeInclude;

/**
 * Validates and saves man-hour records. Valid rows are saved, invalid rows are returned with reasons.
 * Rules: employee + job card must exist and be active, the user must be allowed to enter for the employee,
 * one record per employee per job card, end ≥ start, hours > 0, custom fields valid,
 * and daily/weekly limits (hours spread evenly across the record's days) — admins bypass the limits.
 */
export async function createRecords(inputs: RecordInput[], options: Options): Promise<CreateResult> {
  const { actor } = options;
  const settings = await getSettings();
  const method = METHOD_FOR_SOURCE[options.source];
  if (method && !methodAllowed(actor, settings.methods, method)) {
    throw new HttpError(403, `${LOGGING_METHOD_INFO[method].label} is switched off by the administrator.`);
  }
  const fieldDefs: FieldDef[] = toFieldDefs(await getFieldDefinitions("RECORD"));
  const scope = getEntryScope(actor);

  const fileNos = inputs.map((input) => (input.employeeId ? "" : normalizeCode(input.employeeFileNo))).filter(Boolean);
  const employeeIds = inputs.map((input) => input.employeeId).filter((id): id is string => !!id);
  const employees = await prisma.employee.findMany({
    where: { OR: [{ id: { in: employeeIds } }, { fileNo: { in: fileNos } }] },
    include: employeeInclude,
  });
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const employeeByFileNo = new Map(employees.map((employee) => [employee.fileNo, employee]));

  const codes = inputs.map((input) => normalizeCode(input.jobCardCode)).filter(Boolean);
  const jobCards = await prisma.jobCard.findMany({ where: { code: { in: codes } } });
  const jobCardByCode = new Map(jobCards.map((card) => [card.code, card]));

  const existingPairs = new Set(
    (
      await prisma.manHourRecord.findMany({
        where: { employeeId: { in: employees.map((e) => e.id) }, jobCardId: { in: jobCards.map((c) => c.id) } },
        select: { employeeId: true, jobCardId: true },
      })
    ).map((pair) => `${pair.employeeId}|${pair.jobCardId}`),
  );

  // Prime hour-limit tracker with existing records around the dates in this batch.
  const tracker = new LoadTracker(settings);
  const enforceLimits = !isAdmin(actor) && tracker.active;
  if (enforceLimits) {
    const dates = inputs.flatMap((input) => [parseDate(input.startDate), parseDate(input.endDate)]).filter((d): d is Date => !!d);
    if (dates.length) {
      const min = new Date(Math.min(...dates.map((d) => d.getTime())));
      const max = new Date(Math.max(...dates.map((d) => d.getTime())));
      await tracker.prime(employees.map((e) => e.id), min, max);
    }
  }

  const invalid: RowError[] = [];
  const toCreate: { row: number; data: Prisma.ManHourRecordUncheckedCreateInput; label: RowError }[] = [];

  for (const input of inputs) {
    const errors: string[] = [];
    const fileNo = normalizeCode(input.employeeFileNo);
    const code = normalizeCode(input.jobCardCode);
    const employee = input.employeeId ? employeeById.get(input.employeeId) : employeeByFileNo.get(fileNo);
    const jobCard = code ? jobCardByCode.get(code) : undefined;
    const label = { row: input.row, employee: employee ? `${employee.fileNo} – ${employee.name}` : fileNo, jobCard: code, errors };

    if (!employee) errors.push(fileNo || input.employeeId ? `Employee "${fileNo || input.employeeId}" not found` : "Employee is required");
    else if (!employee.active) errors.push("Employee is inactive");
    else if (!scopeAllows(scope, employee.id)) errors.push("You are not allowed to enter records for this employee");

    if (!code) errors.push("Job card ID is required");
    else if (!jobCard) errors.push(`Job card "${code}" not found`);
    else if (!jobCard.active) errors.push(`Job card "${code}" is inactive`);
    else if (jobCard.status === "CLOSED" && !isAdmin(actor)) errors.push(`Job card "${code}" is closed`);

    const start = parseDate(input.startDate);
    const end = parseDate(input.endDate);
    if (!start) errors.push("Start date is missing or invalid");
    if (!end) errors.push("End date is missing or invalid");
    if (start && end && end < start) errors.push("End date is before start date");

    const hours = parseHours(input.hours);
    if (hours === null) errors.push("Hours worked is missing or not a number");
    else if (hours <= 0) errors.push("Hours worked must be more than 0");
    else if (hours > 99999) errors.push("Hours worked is too large");

    const custom = validateCustomFields(fieldDefs, input.customFields);
    errors.push(...custom.errors);

    const preparedByDate = parseDate(input.preparedByDate);
    const approvedByDate = parseDate(input.approvedByDate);
    if (input.preparedByDate && !preparedByDate) errors.push("Prepared-by date is invalid");
    if (input.approvedByDate && !approvedByDate) errors.push("Approved-by date is invalid");

    if (employee && jobCard) {
      const pair = `${employee.id}|${jobCard.id}`;
      if (existingPairs.has(pair)) errors.push("This job card is already recorded (closed) for this employee");
      else if (toCreate.some((entry) => `${entry.data.employeeId}|${entry.data.jobCardId}` === pair))
        errors.push("Same employee and job card appears more than once in this submission");
    }

    if (errors.length === 0 && enforceLimits && employee && start && end && hours !== null) {
      errors.push(...tracker.tryAdd(employee.id, start, end, hours));
    }

    if (errors.length || !employee || !jobCard || !start || !end || hours === null) {
      invalid.push(label);
      continue;
    }

    toCreate.push({
      row: input.row,
      label,
      data: {
        employeeId: employee.id,
        jobCardId: jobCard.id,
        startDate: start,
        endDate: end,
        hours: new Prisma.Decimal(hours),
        remarks: String(input.remarks ?? "").trim(),
        customFields: custom.values,
        employeeName: employee.name,
        jobTitle: employee.jobTitle,
        supervisorName: supervisorNames(employee),
        hourlyRate: employee.hourlyRate,
        preparedByName: String(input.preparedByName ?? "").trim(),
        preparedByDate,
        approvedByName: String(input.approvedByName ?? "").trim(),
        approvedByDate,
        source: options.source,
        scanId: options.scanId ?? null,
        importBatchId: options.importBatchId ?? null,
        createdById: actor.id,
        updatedById: actor.id,
      },
    });
  }

  const createdIds: string[] = [];
  for (const entry of toCreate) {
    try {
      const record = await prisma.manHourRecord.create({ data: entry.data, select: { id: true } });
      createdIds.push(record.id);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        invalid.push({ ...entry.label, errors: ["This job card is already recorded (closed) for this employee"] });
      } else {
        throw error;
      }
    }
  }

  if (createdIds.length) {
    await audit(actor.id, "RECORDS_CREATED", "ManHourRecord", "", {
      source: options.source,
      count: createdIds.length,
      ids: createdIds.slice(0, 500),
    });
  }

  invalid.sort((a, b) => a.row - b.row);
  return { created: createdIds.length, createdIds, invalid };
}

/** Saves an Excel/API record import as an ImportBatch and links the created records to it. */
export async function importRecords(
  inputs: RecordInput[],
  actor: CurrentUser,
  meta: { source: DataSource; fileName?: string },
): Promise<ImportSummary & { invalid: RowError[] }> {
  const result = await createRecords(inputs, { actor, source: meta.source });
  const summary = {
    totalRows: inputs.length,
    created: result.created,
    skipped: 0,
    failed: result.invalid.length,
    issues: result.invalid.map((row) => ({
      row: row.row,
      value: `${row.employee} / ${row.jobCard}`,
      reason: row.errors.join("; "),
      status: "failed" as const,
    })),
  };
  const batchId = await saveImportBatch("RECORDS", { source: meta.source, actorId: actor.id, fileName: meta.fileName }, summary);
  if (result.createdIds.length) {
    await prisma.manHourRecord.updateMany({ where: { id: { in: result.createdIds } }, data: { importBatchId: batchId } });
  }
  return { batchId, ...summary, invalid: result.invalid };
}

export type RecordUpdate = {
  employeeId?: string;
  jobCardCode?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  hours?: unknown;
  remarks?: unknown;
  customFields?: Record<string, unknown>;
  preparedByName?: unknown;
  preparedByDate?: unknown;
  approvedByName?: unknown;
  approvedByDate?: unknown;
};

/** Edits a record (managers/admins). Same rules as creation; returns a list of errors or null when saved. */
export async function updateRecord(id: string, update: RecordUpdate, actor: CurrentUser): Promise<string[] | null> {
  const current = await prisma.manHourRecord.findUnique({ where: { id }, include: { jobCard: true } });
  if (!current) return ["Record not found"];
  // "Edit records" covers the records the user can see, and moving a record only to someone they can see.
  const visible = getViewScope(actor);
  if (!scopeAllows(visible, current.employeeId)) return ["Record not found"];
  if (update.employeeId !== undefined && !scopeAllows(visible, update.employeeId)) return ["You can only move records to employees you can see"];
  if (current.source === "QR") {
    const locked = ["employeeId", "jobCardCode", "startDate", "endDate", "hours"] as const;
    const changed = locked.filter((key) => {
      if (update[key] === undefined) return false;
      if (key === "employeeId") return update.employeeId !== current.employeeId;
      if (key === "jobCardCode") return normalizeCode(update.jobCardCode) !== current.jobCard.code;
      if (key === "hours") return parseHours(update.hours) !== Number(current.hours);
      const date = parseDate(update[key]);
      return toIsoDate(date) !== toIsoDate(key === "startDate" ? current.startDate : current.endDate);
    });
    if (changed.length) return ["This record comes from QR scans: correct its work sessions instead (Work Sessions page or the job card page)"];
  }

  const errors: string[] = [];
  const employeeId = update.employeeId ?? current.employeeId;
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: employeeInclude });
  if (!employee) errors.push("Employee not found");

  const code = update.jobCardCode !== undefined ? normalizeCode(update.jobCardCode) : current.jobCard.code;
  const jobCard = await prisma.jobCard.findUnique({ where: { code } });
  if (!jobCard) errors.push(`Job card "${code}" not found`);
  else if (!jobCard.active && jobCard.id !== current.jobCardId) errors.push(`Job card "${code}" is inactive`);

  const start = update.startDate !== undefined ? parseDate(update.startDate) : current.startDate;
  const end = update.endDate !== undefined ? parseDate(update.endDate) : current.endDate;
  if (!start) errors.push("Start date is invalid");
  if (!end) errors.push("End date is invalid");
  if (start && end && end < start) errors.push("End date is before start date");

  const hours = update.hours !== undefined ? parseHours(update.hours) : Number(current.hours);
  if (hours === null || hours <= 0) errors.push("Hours worked must be a number more than 0");

  const fieldDefs = toFieldDefs(await getFieldDefinitions("RECORD"));
  const custom = validateCustomFields(
    fieldDefs,
    update.customFields ?? (current.customFields as Record<string, unknown>),
  );
  errors.push(...custom.errors);

  const preparedByDate =
    update.preparedByDate !== undefined ? parseDate(update.preparedByDate) : current.preparedByDate;
  const approvedByDate =
    update.approvedByDate !== undefined ? parseDate(update.approvedByDate) : current.approvedByDate;

  if (employee && jobCard && (employee.id !== current.employeeId || jobCard.id !== current.jobCardId)) {
    const clash = await prisma.manHourRecord.findFirst({
      where: { employeeId: employee.id, jobCardId: jobCard.id, id: { not: id } },
      select: { id: true },
    });
    if (clash) errors.push("This job card is already recorded (closed) for this employee");
  }

  if (errors.length === 0 && !isAdmin(actor) && employee && start && end && hours !== null) {
    const tracker = new LoadTracker(await getSettings());
    await tracker.prime([employee.id], start, end, id);
    errors.push(...tracker.tryAdd(employee.id, start, end, hours));
  }

  if (errors.length || !employee || !jobCard || !start || !end || hours === null) return errors;

  const employeeChanged = employee.id !== current.employeeId;
  const data: Prisma.ManHourRecordUncheckedUpdateInput = {
    employeeId: employee.id,
    jobCardId: jobCard.id,
    startDate: start,
    endDate: end,
    hours: new Prisma.Decimal(hours),
    remarks: update.remarks !== undefined ? String(update.remarks ?? "").trim() : current.remarks,
    customFields: custom.values,
    preparedByName:
      update.preparedByName !== undefined ? String(update.preparedByName ?? "").trim() : current.preparedByName,
    preparedByDate,
    approvedByName:
      update.approvedByName !== undefined ? String(update.approvedByName ?? "").trim() : current.approvedByName,
    approvedByDate,
    updatedById: actor.id,
    ...(employeeChanged
      ? { employeeName: employee.name, jobTitle: employee.jobTitle, supervisorName: supervisorNames(employee) }
      : {}),
  };

  try {
    await prisma.manHourRecord.update({ where: { id }, data });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return ["This job card is already recorded (closed) for this employee"];
    throw error;
  }

  await audit(actor.id, "RECORD_UPDATED", "ManHourRecord", id, {
    before: {
      employeeId: current.employeeId,
      jobCard: current.jobCard.code,
      startDate: toIsoDate(current.startDate),
      endDate: toIsoDate(current.endDate),
      hours: Number(current.hours),
      remarks: current.remarks,
    },
    after: { employeeId: employee.id, jobCard: jobCard.code, startDate: toIsoDate(start), endDate: toIsoDate(end), hours },
  });
  return null;
}
