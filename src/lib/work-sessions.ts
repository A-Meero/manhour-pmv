import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canScanTime, reviewsAllSessions } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import { getSettings, type AppSettings } from "@/lib/settings";
import { addDays, formatDate, localDay, spreadHours, toIsoDate, weekStart } from "@/lib/dates";
import { employeeInclude, supervisorNames } from "@/lib/records";
import { audit } from "@/lib/audit";
import { notify, supervisorsOrAdmins } from "@/lib/notifications";

/**
 * QR time tracking. A technician scans a job card's QR code to start and stop work. Each start→stop is a WorkSession;
 * all finished sessions of one employee on one job card are summed into that pair's single ManHourRecord (source QR),
 * so Records, Analytics, exports and the hour limits keep working unchanged.
 */

const HOUR_MS = 60 * 60 * 1000;
const round2 = (value: number) => Math.round(value * 100) / 100;

export const sessionHours = (startedAt: Date, endedAt: Date | null, now = new Date()) =>
  Math.max(0, ((endedAt ?? now).getTime() - startedAt.getTime()) / HOUR_MS);

type Tx = Prisma.TransactionClient;

/** Serialises session changes per employee so two quick taps can't open two sessions. */
export async function lockEmployee(tx: Tx, employeeId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`work-session:${employeeId}`}))`;
}

/**
 * Re-computes the employee's QR record for a job card from the finished sessions.
 * Leaves records entered another way alone; deletes the QR record when no time is left.
 */
export async function rollUpRecord(tx: Tx, employeeId: string, jobCardId: string, actorId: string | null) {
  const record = await tx.manHourRecord.findUnique({ where: { employeeId_jobCardId: { employeeId, jobCardId } } });
  if (record && record.source !== "QR") return;
  const sessions = await tx.workSession.findMany({
    where: { employeeId, jobCardId, endedAt: { not: null } },
    orderBy: { startedAt: "asc" },
  });
  const hours = round2(sessions.reduce((sum, s) => sum + sessionHours(s.startedAt, s.endedAt), 0));
  if (sessions.length === 0 || hours <= 0) {
    if (record) await tx.manHourRecord.delete({ where: { id: record.id } });
    return;
  }
  const startDate = localDay(sessions[0].startedAt);
  const endDate = sessions.reduce((latest, s) => {
    const day = localDay(s.endedAt as Date);
    return day > latest ? day : latest;
  }, startDate);

  if (record) {
    await tx.manHourRecord.update({
      where: { id: record.id },
      data: { startDate, endDate, hours: new Prisma.Decimal(hours), updatedById: actorId },
    });
    return;
  }
  const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, include: employeeInclude });
  await tx.manHourRecord.create({
    data: {
      employeeId,
      jobCardId,
      startDate,
      endDate,
      hours: new Prisma.Decimal(hours),
      employeeName: employee.name,
      jobTitle: employee.jobTitle,
      supervisorName: supervisorNames(employee),
      hourlyRate: employee.hourlyRate,
      source: "QR",
      createdById: actorId,
      updatedById: actorId,
    },
  });
}

/**
 * The employee's hours on a day and in its week (Settings week start): finished sessions counted on the day they
 * started, plus records entered other ways spread over their days. Optionally leaves one session out.
 */
export async function employeeLoad(tx: Tx | typeof prisma, employeeId: string, day: Date, weekStartDay: number, excludeSessionId?: string) {
  const from = weekStart(day, weekStartDay);
  const to = addDays(from, 6);
  const load = new Map<string, number>();
  const add = (key: string, hours: number) => load.set(key, (load.get(key) ?? 0) + hours);
  const sessions = await tx.workSession.findMany({
    where: {
      employeeId,
      endedAt: { not: null },
      startedAt: { gte: addDays(from, -1), lt: addDays(to, 2) },
      ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
    },
    select: { startedAt: true, endedAt: true },
  });
  for (const s of sessions) add(toIsoDate(localDay(s.startedAt)), sessionHours(s.startedAt, s.endedAt));
  const records = await tx.manHourRecord.findMany({
    where: { employeeId, source: { not: "QR" }, startDate: { lte: to }, endDate: { gte: from } },
    select: { startDate: true, endDate: true, hours: true },
  });
  for (const r of records) for (const part of spreadHours(r.startDate, r.endDate, Number(r.hours))) add(toIsoDate(part.day), part.hours);
  let week = 0;
  for (let offset = 0; offset < 7; offset += 1) week += load.get(toIsoDate(addDays(from, offset))) ?? 0;
  return { day: load.get(toIsoDate(day)) ?? 0, week };
}

/** Flags the session for review when the employee's day or week now goes over the limits from Settings. Returns true when flagged. */
async function flagIfOverLimit(tx: Tx, sessionId: string, employeeId: string, startedAt: Date, settings: AppSettings) {
  const { dailyHourLimit, weeklyHourLimit, weekStartDay } = settings;
  if (dailyHourLimit === null && weeklyHourLimit === null) return false;
  const day = localDay(startedAt);
  const totals = await employeeLoad(tx, employeeId, day, weekStartDay);
  const notes: string[] = [];
  if (dailyHourLimit !== null && totals.day > dailyHourLimit + 0.001) {
    notes.push(`Daily limit of ${dailyHourLimit}h exceeded on ${formatDate(day)} (${round2(totals.day)}h)`);
  }
  if (weeklyHourLimit !== null && totals.week > weeklyHourLimit + 0.001) {
    notes.push(`Weekly limit of ${weeklyHourLimit}h exceeded (${round2(totals.week)}h)`);
  }
  if (notes.length) {
    await tx.workSession.update({ where: { id: sessionId }, data: { needsReview: true, reviewNote: notes.join("; ") } });
  }
  return notes.length > 0;
}

/** Tells the employee's supervisors (admins if none) that a session needs review. Once per session. */
export async function notifyReview(sessionId: string) {
  try {
    const session = await prisma.workSession.findUnique({
      where: { id: sessionId },
      include: { employee: { select: { name: true, fileNo: true } }, jobCard: { select: { code: true } } },
    });
    if (!session?.needsReview) return;
    const recipients = await supervisorsOrAdmins(session.employeeId);
    await notify(
      recipients.map((r) => r.id),
      {
        kind: "SESSION_REVIEW",
        title: `Session to review: ${session.employee.name} on ${session.jobCard.code}`,
        body: session.reviewNote,
        link: "/sessions?show=review",
        dedupeKey: `session-review:${session.id}`,
      },
    );
  } catch (error) {
    console.warn("[work-sessions] review notification failed", error);
  }
}

/** Stops sessions that ran longer than the maximum length from Settings, and flags them for review. */
export async function autoStopStale(filter: Prisma.WorkSessionWhereInput = {}) {
  const settings = await getSettings();
  const maxMs = settings.maxSessionHours * HOUR_MS;
  const stale = await prisma.workSession.findMany({
    // Sessions reminded after the shift are stopped by the shift check (src/lib/shifts.ts) at the hour limits.
    where: { ...filter, endedAt: null, shiftReminderAt: null, startedAt: { lt: new Date(Date.now() - maxMs) } },
    select: { id: true, employeeId: true, jobCardId: true, startedAt: true },
  });
  for (const session of stale) {
    await prisma.$transaction(async (tx) => {
      await lockEmployee(tx, session.employeeId);
      const updated = await tx.workSession.updateMany({
        where: { id: session.id, endedAt: null },
        data: {
          endedAt: new Date(session.startedAt.getTime() + maxMs),
          autoStopped: true,
          needsReview: true,
          reviewNote: `No stop scan: stopped automatically after ${settings.maxSessionHours}h. Please correct the end time.`,
        },
      });
      if (updated.count) await rollUpRecord(tx, session.employeeId, session.jobCardId, null);
    });
    await notifyReview(session.id);
  }
  return stale.length;
}

/** Why this technician can't start on the card right now, or "" if they can. */
export async function startBlocker(user: CurrentUser, jobCard: { id: string; active: boolean; status: string }) {
  const settings = await getSettings();
  if (!user.employeeId) return "Your login is not linked to an employee record. Ask the administrator.";
  if (!canScanTime(user, settings.methods)) return "Job card QR time tracking is switched off by the administrator.";
  const employee = await prisma.employee.findUnique({ where: { id: user.employeeId }, select: { active: true } });
  if (!employee?.active) return "Your employee record is inactive.";
  if (!jobCard.active) return "This job card is inactive.";
  if (jobCard.status === "CLOSED") return "This job card is closed.";
  const record = await prisma.manHourRecord.findUnique({
    where: { employeeId_jobCardId: { employeeId: user.employeeId, jobCardId: jobCard.id } },
    select: { source: true },
  });
  if (record && record.source !== "QR") return "Your hours on this job card were already recorded another way (sheet, form or import).";
  return "";
}

/** Starts work on a job card. A session still running on another card is stopped first (one job at a time). */
export async function startSession(user: CurrentUser, jobCardId: string) {
  const jobCard = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
  if (!jobCard) throw new HttpError(404, "Job card not found.");
  const blocker = await startBlocker(user, jobCard);
  if (blocker) throw new HttpError(400, blocker);
  const employeeId = user.employeeId as string;
  await autoStopStale({ employeeId });
  const settings = await getSettings();

  const result = await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, employeeId);
    const open = await tx.workSession.findFirst({ where: { employeeId, endedAt: null }, include: { jobCard: { select: { code: true } } } });
    if (open && open.jobCardId === jobCardId) return { session: open, stoppedOther: "" };
    let stoppedOther = "";
    let flaggedId = "";
    if (open) {
      await tx.workSession.update({ where: { id: open.id }, data: { endedAt: new Date() } });
      await rollUpRecord(tx, employeeId, open.jobCardId, user.id);
      if (await flagIfOverLimit(tx, open.id, employeeId, open.startedAt, settings)) flaggedId = open.id;
      stoppedOther = open.jobCard.code;
    }
    const session = await tx.workSession.create({ data: { employeeId, jobCardId, userId: user.id, startedAt: new Date() } });
    return { session, stoppedOther, flaggedId };
  });
  if (result.flaggedId) await notifyReview(result.flaggedId);
  await audit(user.id, "WORK_STARTED", "WorkSession", result.session.id, { jobCard: jobCard.code, stoppedOther: result.stoppedOther });
  return result;
}

/** Stops the technician's running session on a job card and adds its time to their record. */
export async function stopSession(user: CurrentUser, jobCardId: string) {
  if (!user.employeeId) throw new HttpError(400, "Your login is not linked to an employee record.");
  const employeeId = user.employeeId;
  await autoStopStale({ employeeId });
  const settings = await getSettings();
  const session = await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, employeeId);
    const open = await tx.workSession.findFirst({ where: { employeeId, jobCardId, endedAt: null } });
    if (!open) throw new HttpError(400, "You have no running work on this job card. It may have been stopped automatically.");
    const stopped = await tx.workSession.update({ where: { id: open.id }, data: { endedAt: new Date() } });
    await rollUpRecord(tx, employeeId, jobCardId, user.id);
    const flagged = await flagIfOverLimit(tx, open.id, employeeId, open.startedAt, settings);
    return { ...stopped, flagged };
  });
  if (session.flagged) await notifyReview(session.id);
  await audit(user.id, "WORK_STOPPED", "WorkSession", session.id, { hours: round2(sessionHours(session.startedAt, session.endedAt)) });
  return session;
}

/** Stops every running session on a job card (used when the card is closed). */
export async function stopAllOnCard(tx: Tx, jobCardId: string, actorId: string) {
  const open = await tx.workSession.findMany({ where: { jobCardId, endedAt: null } });
  for (const session of open) {
    await lockEmployee(tx, session.employeeId);
    await tx.workSession.update({
      where: { id: session.id },
      data: { endedAt: new Date(), reviewNote: "Stopped when the job card was closed." },
    });
    await rollUpRecord(tx, session.employeeId, jobCardId, actorId);
  }
  return open.length;
}

// ---------- review & corrections ----------

/** "Review all work sessions": every employee. Supervisors: their employees. */
export function canFixSessionsOf(user: CurrentUser, employeeId: string) {
  return reviewsAllSessions(user) || user.supervisedEmployeeIds.includes(employeeId);
}

export function reviewScopeWhere(user: CurrentUser): Prisma.WorkSessionWhereInput {
  return reviewsAllSessions(user) ? {} : { employeeId: { in: user.supervisedEmployeeIds } };
}

function parseMoment(value: unknown, label: string): Date {
  const date = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw new HttpError(400, `${label} is missing or invalid.`);
  return date;
}

async function validateTimes(tx: Tx, employeeId: string, startedAt: Date, endedAt: Date | null, excludeId?: string) {
  const now = new Date();
  if (startedAt > now) throw new HttpError(400, "The start time is in the future.");
  if (endedAt) {
    if (endedAt <= startedAt) throw new HttpError(400, "The end time must be after the start time.");
    if (endedAt > now) throw new HttpError(400, "The end time is in the future.");
    if (endedAt.getTime() - startedAt.getTime() > 72 * HOUR_MS) throw new HttpError(400, "A session can't be longer than 72 hours.");
  }
  const end = endedAt ?? now;
  const overlap = await tx.workSession.findFirst({
    where: {
      employeeId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startedAt: { lt: end },
      OR: [{ endedAt: null }, { endedAt: { gt: startedAt } }],
    },
    include: { jobCard: { select: { code: true } } },
  });
  if (overlap) throw new HttpError(400, `This overlaps another session of the same employee on ${overlap.jobCard.code}.`);
}

/** Corrects a session's times (e.g. after an auto-stop) and clears its review flag. */
export async function editSession(user: CurrentUser, id: string, body: { startedAt?: unknown; endedAt?: unknown; note?: unknown }) {
  const current = await prisma.workSession.findUnique({ where: { id }, include: { jobCard: true } });
  if (!current) throw new HttpError(404, "Session not found.");
  if (!canFixSessionsOf(user, current.employeeId)) throw new HttpError(403, "You can only fix sessions of the employees you supervise.");
  const startedAt = body.startedAt !== undefined ? parseMoment(body.startedAt, "Start time") : current.startedAt;
  const endedAt = body.endedAt !== undefined ? (body.endedAt ? parseMoment(body.endedAt, "End time") : null) : current.endedAt;
  if (!endedAt && current.endedAt) throw new HttpError(400, "A finished session needs an end time.");
  await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, current.employeeId);
    await validateTimes(tx, current.employeeId, startedAt, endedAt, id);
    await tx.workSession.update({
      where: { id },
      data: {
        startedAt,
        endedAt,
        needsReview: false,
        autoStopped: current.autoStopped,
        reviewNote: body.note !== undefined ? String(body.note ?? "").trim() : `Corrected by ${user.name}`,
        editedById: user.id,
      },
    });
    await rollUpRecord(tx, current.employeeId, current.jobCardId, user.id);
  });
  await audit(user.id, "WORK_SESSION_EDITED", "WorkSession", id, {
    jobCard: current.jobCard.code,
    before: { startedAt: current.startedAt, endedAt: current.endedAt },
    after: { startedAt, endedAt },
  });
}

/** Adds a session a technician forgot to scan. */
export async function addSession(user: CurrentUser, body: { employeeId?: string; jobCardId?: string; startedAt?: unknown; endedAt?: unknown; note?: unknown }) {
  if (!body.employeeId || !body.jobCardId) throw new HttpError(400, "Choose the employee and the job card.");
  if (!canFixSessionsOf(user, body.employeeId)) throw new HttpError(403, "You can only add sessions for the employees you supervise.");
  const [employee, jobCard] = await Promise.all([
    prisma.employee.findUnique({ where: { id: body.employeeId } }),
    prisma.jobCard.findUnique({ where: { id: body.jobCardId } }),
  ]);
  if (!employee) throw new HttpError(404, "Employee not found.");
  if (!jobCard) throw new HttpError(404, "Job card not found.");
  const record = await prisma.manHourRecord.findUnique({
    where: { employeeId_jobCardId: { employeeId: employee.id, jobCardId: jobCard.id } },
    select: { source: true },
  });
  if (record && record.source !== "QR") throw new HttpError(400, "This employee's hours on this job card were recorded another way.");
  const startedAt = parseMoment(body.startedAt, "Start time");
  const endedAt = parseMoment(body.endedAt, "End time");
  const session = await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, employee.id);
    await validateTimes(tx, employee.id, startedAt, endedAt);
    const created = await tx.workSession.create({
      data: {
        employeeId: employee.id,
        jobCardId: jobCard.id,
        userId: user.id,
        startedAt,
        endedAt,
        editedById: user.id,
        reviewNote: String(body.note ?? "").trim() || `Added by ${user.name}`,
      },
    });
    await rollUpRecord(tx, employee.id, jobCard.id, user.id);
    return created;
  });
  await audit(user.id, "WORK_SESSION_ADDED", "WorkSession", session.id, { employee: employee.fileNo, jobCard: jobCard.code, startedAt, endedAt });
}

export async function deleteSession(user: CurrentUser, id: string) {
  const current = await prisma.workSession.findUnique({ where: { id }, include: { jobCard: true, employee: true } });
  if (!current) throw new HttpError(404, "Session not found.");
  if (!canFixSessionsOf(user, current.employeeId)) throw new HttpError(403, "You can only remove sessions of the employees you supervise.");
  await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, current.employeeId);
    await tx.workSession.delete({ where: { id } });
    await rollUpRecord(tx, current.employeeId, current.jobCardId, user.id);
  });
  await audit(user.id, "WORK_SESSION_DELETED", "WorkSession", id, {
    employee: current.employee.fileNo,
    jobCard: current.jobCard.code,
    startedAt: current.startedAt,
    endedAt: current.endedAt,
  });
}

/** Marks a flagged session as checked without changing its times. */
export async function approveSession(user: CurrentUser, id: string) {
  const current = await prisma.workSession.findUnique({ where: { id } });
  if (!current) throw new HttpError(404, "Session not found.");
  if (!canFixSessionsOf(user, current.employeeId)) throw new HttpError(403, "You can only review sessions of the employees you supervise.");
  if (!current.endedAt) throw new HttpError(400, "This session is still running.");
  await prisma.workSession.update({ where: { id }, data: { needsReview: false, editedById: user.id } });
  await audit(user.id, "WORK_SESSION_APPROVED", "WorkSession", id);
}

// ---------- after the shift ----------

export type AfterShiftAnswer = "CONTINUE" | "SHIFT_END" | "KEEP";

/** The technician's unanswered after-shift session on this card: still running past the shift, or stopped at a limit. */
export function pendingAfterShift(employeeId: string, jobCardId: string) {
  return prisma.workSession.findFirst({
    where: { employeeId, jobCardId, shiftReminderAt: { not: null }, afterShiftAnswer: null, OR: [{ endedAt: null }, { limitStoppedAt: { not: null } }] },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, endedAt: true, shiftEndAt: true, limitStoppedAt: true },
  });
}

/**
 * "Continue working" (still running) · "I finished at shift end" (end time set to the shift end) ·
 * "I worked until the limit" (stopped at the limit: kept, stays flagged for the supervisor).
 */
export async function answerAfterShift(user: CurrentUser, jobCardId: string, answer: AfterShiftAnswer) {
  if (!user.employeeId) throw new HttpError(400, "Your login is not linked to an employee record.");
  const employeeId = user.employeeId;
  const result = await prisma.$transaction(async (tx) => {
    await lockEmployee(tx, employeeId);
    const session = await tx.workSession.findFirst({
      where: { employeeId, jobCardId, shiftReminderAt: { not: null }, afterShiftAnswer: null, OR: [{ endedAt: null }, { limitStoppedAt: { not: null } }] },
      orderBy: { startedAt: "desc" },
    });
    if (!session) throw new HttpError(400, "There is nothing to answer on this job card any more.");
    const running = !session.endedAt;
    if (answer === "CONTINUE") {
      if (!running) throw new HttpError(400, "This work was already stopped at the hour limit.");
      return tx.workSession.update({ where: { id: session.id }, data: { afterShiftAnswer: "CONTINUE" } });
    }
    if (answer === "KEEP") {
      if (running) throw new HttpError(400, "This work is still running.");
      return tx.workSession.update({
        where: { id: session.id },
        data: { afterShiftAnswer: "KEEP", reviewNote: `${session.reviewNote} The technician says they worked until then.`.trim() },
      });
    }
    // SHIFT_END: the technician finished when the shift ended and forgot to stop.
    const end = session.shiftEndAt && session.shiftEndAt > session.startedAt ? session.shiftEndAt : session.startedAt;
    const updated = await tx.workSession.update({
      where: { id: session.id },
      data: {
        endedAt: end,
        afterShiftAnswer: "SHIFT_END",
        needsReview: false,
        autoStopped: false,
        reviewNote: "Technician: finished at the shift end and forgot to stop.",
      },
    });
    await rollUpRecord(tx, employeeId, jobCardId, user.id);
    return updated;
  });
  await audit(user.id, "AFTER_SHIFT_ANSWER", "WorkSession", result.id, { answer, endedAt: result.endedAt });
  return result;
}
