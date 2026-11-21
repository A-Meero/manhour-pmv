import "server-only";

import { prisma } from "@/lib/prisma";
import { getSettings, type AppSettings } from "@/lib/settings";
import { addDays, formatDateTime, formatTime, localDay, startOfLocalDay } from "@/lib/dates";
import { employeeLoad, lockEmployee, notifyReview, rollUpRecord } from "@/lib/work-sessions";
import { escapeHtml, mailStatus, sendMail } from "@/lib/mail";
import { notify, supervisorsOrAdmins } from "@/lib/notifications";
import { parseTime } from "@/lib/shift-info";
import { audit } from "@/lib/audit";

/**
 * After-shift check (runs every minute, see src/lib/scheduler.ts):
 * 1. A QR session still running when its shift ended (+ grace minutes) gets an in-app reminder to the technician.
 *    The timer keeps running.
 * 2. Such a session is stopped when the technician's daily or weekly hour limit (Settings) is reached, whichever
 *    comes first, at the exact moment it was reached; with no limits set, at the maximum session length.
 *    It is flagged for review, the technician is notified, and the supervisors (admins if none) get an email.
 * When the technician opens the job card they choose "Continue working" / "I finished at shift end", or after a
 * limit stop "I finished at shift end" / "I worked until the limit" (src/lib/work-sessions.ts answerAfterShift).
 * Sessions started outside the employee's shift (overtime, days off) are left to the maximum session length.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** A session started this long before the shift still belongs to it (early start). */
const EARLY_START_MS = 2 * HOUR;

type ShiftTimes = { startTime: string; endTime: string; days: number[] };

/** The shift occurrence a session started in, or null when it started outside the shift. */
export function shiftOccurrenceFor(shift: ShiftTimes, startedAt: Date): { start: Date; end: Date } | null {
  const startMin = parseTime(shift.startTime);
  const endMin = parseTime(shift.endTime);
  if (startMin === null || endMin === null) return null;
  const day = localDay(startedAt);
  let early: { start: Date; end: Date } | null = null;
  for (const offset of [-1, 0, 1]) {
    const date = addDays(day, offset);
    if (!shift.days.includes(date.getUTCDay())) continue;
    const midnight = startOfLocalDay(date).getTime();
    const start = new Date(midnight + startMin * MINUTE);
    const end = new Date(midnight + (endMin > startMin ? endMin : endMin + 24 * 60) * MINUTE);
    if (startedAt >= start && startedAt < end) return { start, end };
    if (startedAt >= new Date(start.getTime() - EARLY_START_MS) && startedAt < start && !early) early = { start, end };
  }
  return early;
}

export async function checkShiftEnds(now = new Date()) {
  const settings = await getSettings();
  const reminded = settings.shiftAlerts ? await remindAfterShift(now, settings) : 0;
  const { stopped, emailed } = await stopAtLimits(now, settings);
  return { reminded, stopped, emailed };
}

/** Step 1: reminder at shift end + grace. */
async function remindAfterShift(now: Date, settings: AppSettings) {
  const graceMs = settings.shiftGraceMinutes * MINUTE;
  const open = await prisma.workSession.findMany({
    where: { endedAt: null, shiftReminderAt: null, employee: { shift: { active: true } } },
    include: {
      jobCard: { select: { code: true, asset: { select: { code: true } } } },
      employee: { select: { shift: { select: { startTime: true, endTime: true, days: true } }, user: { select: { id: true } } } },
    },
  });
  let reminded = 0;
  for (const session of open) {
    const shift = session.employee.shift;
    if (!shift) continue;
    const occurrence = shiftOccurrenceFor(shift, session.startedAt);
    if (!occurrence || now.getTime() < occurrence.end.getTime() + graceMs) continue;
    // Only the run that sets the reminder sends it.
    const updated = await prisma.workSession.updateMany({
      where: { id: session.id, endedAt: null, shiftReminderAt: null },
      data: { shiftReminderAt: now, shiftEndAt: occurrence.end },
    });
    if (!updated.count) continue;
    reminded += 1;
    const technician = session.userId ?? session.employee.user?.id;
    if (technician) {
      const asset = session.jobCard.asset ? ` (${session.jobCard.asset.code})` : "";
      await notify([technician], {
        kind: "SHIFT_REMINDER",
        title: `You are still clocked in on ${session.jobCard.code}${asset}`,
        body: `Your shift ended at ${formatTime(occurrence.end)}. The timer is still running: open the job card to continue or to say you finished at ${formatTime(occurrence.end)}.`,
        link: `/jc/${encodeURIComponent(session.jobCard.code)}`,
        dedupeKey: `shift-reminder:${session.id}`,
      });
    }
    await audit(null, "SHIFT_REMINDER", "WorkSession", session.id, { jobCard: session.jobCard.code, shiftEnd: occurrence.end });
  }
  return reminded;
}

type Alert = { employee: string; jobCard: string; startedAt: Date; shiftEnd: Date | null; stoppedAt: Date; reason: string };

/** Step 2: stop reminded sessions at the daily / weekly limit (or the maximum session length). */
async function stopAtLimits(now: Date, settings: AppSettings) {
  const running = await prisma.workSession.findMany({
    where: { endedAt: null, shiftReminderAt: { not: null } },
    include: {
      jobCard: { select: { code: true } },
      employee: { select: { fileNo: true, name: true, user: { select: { id: true } } } },
    },
  });
  const byRecipient = new Map<string, Alert[]>();
  let stopped = 0;

  for (const session of running) {
    const result = await prisma.$transaction(async (tx) => {
      await lockEmployee(tx, session.employeeId);
      const limit = await limitMoment(tx, session, settings);
      if (now < limit.at) return null;
      const updated = await tx.workSession.updateMany({
        where: { id: session.id, endedAt: null },
        data: {
          endedAt: limit.at,
          autoStopped: true,
          needsReview: true,
          limitStoppedAt: now,
          reviewNote: `Still clocked in after the shift: stopped when the ${limit.reason} was reached (${formatDateTime(limit.at)}).`,
        },
      });
      if (!updated.count) return null;
      await rollUpRecord(tx, session.employeeId, session.jobCardId, null);
      return limit;
    });
    if (!result) continue;
    stopped += 1;

    const technician = session.userId ?? session.employee.user?.id;
    if (technician) {
      await notify([technician], {
        kind: "LIMIT_STOP",
        title: `Your work on ${session.jobCard.code} was stopped`,
        body: `You were still clocked in after your shift, so the timer was stopped at ${formatDateTime(result.at)} when your ${result.reason} was reached. Open the job card to confirm when you finished.`,
        link: `/jc/${encodeURIComponent(session.jobCard.code)}`,
        dedupeKey: `limit-stop:${session.id}`,
      });
    }
    await notifyReview(session.id);
    const alert: Alert = {
      employee: `${session.employee.fileNo} – ${session.employee.name}`,
      jobCard: session.jobCard.code,
      startedAt: session.startedAt,
      shiftEnd: session.shiftEndAt,
      stoppedAt: result.at,
      reason: result.reason,
    };
    for (const recipient of await supervisorsOrAdmins(session.employeeId)) {
      byRecipient.set(recipient.email, [...(byRecipient.get(recipient.email) ?? []), alert]);
    }
  }

  let emailed = 0;
  if (byRecipient.size) {
    const status = mailStatus();
    for (const [to, alerts] of byRecipient) {
      try {
        await sendMail(buildEmail(to, alerts, settings.appBaseUrl));
        emailed += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[shifts] alert email to ${to} not sent: ${reason}`);
        await audit(null, "SHIFT_ALERT_EMAIL_FAILED", "WorkSession", "", { to, provider: status.provider, reason, sessions: alerts.length });
      }
    }
  }
  return { stopped, emailed };
}

/**
 * When the running session reaches the limit: the daily or weekly hour limit (whichever comes first), counting the
 * employee's other hours that day / week; with no limits set, the maximum session length. Never before the shift end.
 */
async function limitMoment(
  tx: Parameters<typeof lockEmployee>[0],
  session: { id: string; employeeId: string; startedAt: Date; shiftEndAt: Date | null },
  settings: AppSettings,
) {
  const start = session.startedAt.getTime();
  const candidates: { at: number; reason: string }[] = [];
  const { dailyHourLimit, weeklyHourLimit } = settings;
  if (dailyHourLimit !== null || weeklyHourLimit !== null) {
    const other = await employeeLoad(tx, session.employeeId, localDay(session.startedAt), settings.weekStartDay, session.id);
    if (dailyHourLimit !== null) candidates.push({ at: start + (dailyHourLimit - other.day) * HOUR, reason: `daily limit of ${dailyHourLimit}h` });
    if (weeklyHourLimit !== null) candidates.push({ at: start + (weeklyHourLimit - other.week) * HOUR, reason: `weekly limit of ${weeklyHourLimit}h` });
  } else {
    candidates.push({ at: start + settings.maxSessionHours * HOUR, reason: `maximum session length of ${settings.maxSessionHours}h` });
  }
  const first = candidates.reduce((a, b) => (b.at < a.at ? b : a));
  const floor = Math.max(start, session.shiftEndAt?.getTime() ?? start);
  return { at: new Date(Math.max(first.at, floor)), reason: first.reason };
}

function buildEmail(to: string, alerts: Alert[], appBaseUrl: string) {
  const subject =
    alerts.length === 1
      ? `Still clocked in after shift: ${alerts[0].employee.split(" – ")[1] ?? alerts[0].employee} on ${alerts[0].jobCard}`
      : `${alerts.length} technicians were still clocked in after their shift`;
  const link = appBaseUrl ? `${appBaseUrl}/sessions?show=review` : "";
  const cell = (value: string, mono = false) => `<td style="padding:4px 8px${mono ? ";font-family:monospace" : ""}">${escapeHtml(value)}</td>`;
  const rows = alerts
    .map(
      (a) =>
        `<tr>${cell(a.employee)}${cell(a.jobCard, true)}${cell(formatDateTime(a.startedAt))}${cell(a.shiftEnd ? formatDateTime(a.shiftEnd) : "")}` +
        `${cell(formatDateTime(a.stoppedAt))}${cell(a.reason)}</tr>`,
    )
    .join("");
  const th = (label: string) => `<th style="padding:4px 8px">${label}</th>`;
  const html =
    `<p>These technicians did not stop work on their job card when their shift ended. They were reminded in the app, ` +
    `and their timer was stopped when their hour limit was reached. The sessions are flagged for review.</p>` +
    `<table style="border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;background:#f3f4f6">` +
    `${th("Employee")}${th("Job card")}${th("Started")}${th("Shift ended")}${th("Stopped at")}${th("Limit")}` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<p>Please confirm or correct the times${link ? `: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a>` : " on the Work Sessions page"}.</p>` +
    `<p style="color:#6b7280;font-size:12px">Man Hour System</p>`;
  const text =
    `These technicians did not stop work when their shift ended. Their timer was stopped when their hour limit was reached, and the sessions are flagged for review:\n\n` +
    alerts
      .map(
        (a) =>
          `- ${a.employee}, job card ${a.jobCard}, started ${formatDateTime(a.startedAt)}${a.shiftEnd ? `, shift ended ${formatDateTime(a.shiftEnd)}` : ""}, stopped ${formatDateTime(a.stoppedAt)} (${a.reason})`,
      )
      .join("\n") +
    // No full stop right after the link: some mail apps include it in the address.
    (link ? `\n\nPlease confirm or correct the times here:\n${link}` : `\n\nPlease confirm or correct the times on the Work Sessions page.`);
  return { to: [to], subject, html, text };
}
