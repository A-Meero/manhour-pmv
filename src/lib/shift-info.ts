/** Shift helpers shared by the server and the Settings screen (no database access). */

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "07:30" → 450 minutes after midnight, or null if invalid */
export function parseTime(value: unknown): number | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export const formatTimeOfDay = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "Sat–Thu", "Sun, Tue, Thu", "Every day" */
export function describeDays(days: number[]) {
  const set = Array.from(new Set(days)).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (set.length === 7) return "Every day";
  if (set.length === 0) return "No days";
  // Look for one run of consecutive days, wrapping around the week (e.g. Sat–Thu).
  for (let start = 0; start < 7; start += 1) {
    if (!set.includes(start) || set.includes((start + 6) % 7)) continue;
    let length = 0;
    while (length < 7 && set.includes((start + length) % 7)) length += 1;
    if (length === set.length && length >= 3) return `${DAY_SHORT[start]}–${DAY_SHORT[(start + length - 1) % 7]}`;
  }
  return set.map((d) => DAY_SHORT[d]).join(", ");
}

export function describeShift(shift: { startTime: string; endTime: string; days: number[] }) {
  const start = parseTime(shift.startTime);
  const end = parseTime(shift.endTime);
  const overnight = start !== null && end !== null && end <= start;
  return `${shift.startTime}–${shift.endTime}${overnight ? " (next day)" : ""} · ${describeDays(shift.days)}`;
}
