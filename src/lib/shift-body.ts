import "server-only";

import { HttpError } from "@/lib/http";
import { formatTimeOfDay, parseTime } from "@/lib/shift-info";

export type ShiftBody = { name?: unknown; startTime?: unknown; endTime?: unknown; days?: unknown; active?: boolean };

/** Validates a shift from the Settings screen. */
export function readShift(body: ShiftBody) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new HttpError(400, "Shift name is required.");
  if (name.length > 60) throw new HttpError(400, "Shift name is too long.");
  const start = parseTime(body.startTime);
  const end = parseTime(body.endTime);
  if (start === null || end === null) throw new HttpError(400, "Start and end must be times like 07:00.");
  if (start === end) throw new HttpError(400, "Start and end can't be the same time.");
  const days = Array.isArray(body.days) ? Array.from(new Set(body.days.map(Number))).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  if (!days.length) throw new HttpError(400, "Choose at least one working day.");
  return { name, startTime: formatTimeOfDay(start), endTime: formatTimeOfDay(end), days: days.sort((a, b) => a - b), active: body.active ?? true };
}

/** Shift chosen for an employee: undefined = not sent, null = no shift, otherwise an existing shift id. */
export async function readShiftId(value: unknown): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const { prisma } = await import("@/lib/prisma");
  const shift = await prisma.shift.findUnique({ where: { id: String(value) }, select: { id: true } });
  if (!shift) throw new HttpError(400, "The chosen shift was not found.");
  return shift.id;
}
