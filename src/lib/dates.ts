const DAY_MS = 24 * 60 * 60 * 1000;

function utcDate(year: number, month: number, day: number): Date | null {
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/**
 * Parses a calendar date into a UTC-midnight Date.
 * Accepts Date objects, Excel serial numbers, YYYY-MM-DD and day-first formats (DD/MM/YYYY, DD-MM-YY, DD.MM.YYYY).
 */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return utcDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    if (value < 1 || value > 100000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * DAY_MS);
    return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (match) return utcDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (match) return utcDate(Number(match[3]), Number(match[2]), Number(match[1]));
  return null;
}

export function toIsoDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/** DD/MM/YYYY for display */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return "";
  const dd = String(value.getUTCDate()).padStart(2, "0");
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${value.getUTCFullYear()}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Inclusive number of calendar days between two dates */
export function daysInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

/** Start of the work week containing `date`. weekStartDay: 0=Sunday … 6=Saturday */
export function weekStart(date: Date, weekStartDay: number): Date {
  const offset = (date.getUTCDay() - weekStartDay + 7) % 7;
  return addDays(date, -offset);
}

export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Splits a record's hours evenly across each day it covers. */
export function spreadHours(start: Date, end: Date, hours: number): { day: Date; hours: number }[] {
  const days = Math.max(1, daysInclusive(start, end));
  const perDay = hours / days;
  return Array.from({ length: days }, (_, index) => ({ day: addDays(start, index), hours: perDay }));
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Time zone used for the calendar day of clock times (QR scans). */
export const APP_TIME_ZONE = "Asia/Kuwait";

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The calendar day (as a UTC-midnight Date, like record dates) of a moment in time, in the app's time zone. */
export function localDay(moment: Date): Date {
  return new Date(`${dayFormatter.format(moment)}T00:00:00.000Z`);
}

/** "08:15" in the app's time zone */
export function formatTime(moment: Date): string {
  return moment.toLocaleTimeString("en-GB", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

/** "19/11/2026 08:15" in the app's time zone */
export function formatDateTime(moment: Date): string {
  return moment.toLocaleString("en-GB", { timeZone: APP_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Kuwait has no daylight saving time, so its offset is fixed. */
const APP_UTC_OFFSET = "+03:00";

/** The moment a calendar day (UTC-midnight Date) starts in the app's time zone. */
export function startOfLocalDay(day: Date): Date {
  return new Date(`${toIsoDate(day)}T00:00:00${APP_UTC_OFFSET}`);
}
