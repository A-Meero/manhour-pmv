import "server-only";

import { prisma } from "@/lib/prisma";

/** Name words for comparing: upper case, letters/digits only ("Khoder  Mohamad-Dib" → ["KHODER", "MOHAMAD", "DIB"]). */
export function nameWords(name: unknown) {
  return String(name ?? "")
    .toUpperCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export type EmployeeMatch = { id: string; fileNo: string; name: string };

/**
 * Finds the employee a printed name (e.g. "Received by") refers to.
 * 1. Same name (case, spaces and punctuation ignored), if only one employee has it.
 * 2. Otherwise an employee whose name words all appear in the printed name, or whose name contains all the
 *    printed words ("KHODER MOHAMAD DIB MEHIEDDINE" ↔ "Khoder Mohamad"). At least two words must agree.
 * When several fit, the one sharing the most words wins; a tie or no match → null (the user picks).
 */
export function matchEmployeeName<T extends { name: string }>(printed: unknown, employees: T[]): T | null {
  const words = nameWords(printed);
  if (!words.length) return null;
  const key = words.join(" ");
  const exact = employees.filter((employee) => nameWords(employee.name).join(" ") === key);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const printedSet = new Set(words);
  const candidates: { employee: T; shared: number }[] = [];
  for (const employee of employees) {
    const own = nameWords(employee.name);
    if (own.length === 0) continue;
    const ownSet = new Set(own);
    const shared = own.filter((word) => printedSet.has(word)).length;
    if (shared < Math.min(2, own.length, words.length)) continue;
    if (own.every((word) => printedSet.has(word)) || words.every((word) => ownSet.has(word))) candidates.push({ employee, shared });
  }
  // Several fit ("KHODER MOHAMAD" and "KHODER MOHAMAD DIB MEHIEDDINE"): the one sharing the most words, if only one does.
  const best = Math.max(0, ...candidates.map((c) => c.shared));
  const top = candidates.filter((c) => c.shared === best);
  return top.length === 1 ? top[0].employee : null;
}

/** Team leaders: active employees whose own (active) login supervises at least one employee. "Received by" is one of them. */
export const TEAM_LEADER_WHERE = { active: true, user: { is: { active: true, supervising: { some: {} } } } } as const;

/** Team leaders to match "Received by" against (one query per request / import). */
export function employeesForMatching() {
  return prisma.employee.findMany({ where: TEAM_LEADER_WHERE, select: { id: true, fileNo: true, name: true } });
}

export async function matchReceivedBy(printed: unknown): Promise<EmployeeMatch | null> {
  if (!nameWords(printed).length) return null;
  return matchEmployeeName(printed, await employeesForMatching());
}
