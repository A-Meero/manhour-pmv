import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canAssignJobCard } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import { notify, usersOfEmployee } from "@/lib/notifications";
import { audit } from "@/lib/audit";

/** The team of a team leader (employee): the employees his login supervises. */
export async function teamOfLeader(leaderEmployeeId: string | null) {
  if (!leaderEmployeeId) return [];
  const rows = await prisma.employeeSupervisor.findMany({
    where: { supervisor: { employeeId: leaderEmployeeId, active: true }, employee: { active: true } },
    select: { employee: { select: { id: true, fileNo: true, name: true } } },
    orderBy: { employee: { name: "asc" } },
  });
  const seen = new Set<string>();
  return rows.map((row) => row.employee).filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

/**
 * Sets who a job card is assigned to (a to-do for those team members; scanning is not limited).
 * Only the card's received-by team leader (and admins) can, and only to that leader's team.
 * Newly assigned members get a notification.
 */
export async function setAssignments(user: CurrentUser, jobCardId: string, employeeIds: unknown) {
  const card = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { id: true, code: true, status: true, receivedById: true, asset: { select: { code: true, description: true } }, assignments: { select: { employeeId: true } } },
  });
  if (!card) throw new HttpError(404, "Job card not found.");
  if (!canAssignJobCard(user, card)) throw new HttpError(403, "Only the team leader this job card was received by (or an admin) can assign it.");
  if (!card.receivedById) throw new HttpError(400, "Choose the received-by team leader on this job card first.");
  const wanted = Array.from(new Set((Array.isArray(employeeIds) ? employeeIds : []).map(String).filter(Boolean)));
  const team = new Set((await teamOfLeader(card.receivedById)).map((e) => e.id));
  const current = new Set(card.assignments.map((a) => a.employeeId));
  // Members who left the team stay assigned until removed; new ones must be in the team.
  const outside = wanted.filter((id) => !team.has(id) && !current.has(id));
  if (outside.length) throw new HttpError(400, "You can only assign members of the team leader's team.");
  const added = wanted.filter((id) => !current.has(id));
  const removed = [...current].filter((id) => !wanted.includes(id));
  await prisma.$transaction([
    prisma.jobCardAssignment.deleteMany({ where: { jobCardId, employeeId: { in: removed } } }),
    prisma.jobCardAssignment.createMany({ data: added.map((employeeId) => ({ jobCardId, employeeId, assignedById: user.id })), skipDuplicates: true }),
  ]);
  if (added.length || removed.length) await audit(user.id, "JOB_CARD_ASSIGNED", "JobCard", jobCardId, { code: card.code, added, removed });
  const asset = card.asset ? ` (${[card.asset.code, card.asset.description].filter(Boolean).join(" – ")})` : "";
  for (const employeeId of added) {
    await notify(await usersOfEmployee(employeeId), {
      kind: "JOB_CARD_ASSIGNED",
      title: `Job card ${card.code}${asset} was assigned to you`,
      body: `By ${user.name}.`,
      link: `/job-cards/${card.id}`,
      dedupeKey: `assigned:${card.id}:${employeeId}:${Date.now()}`,
    });
  }
  return { added: added.length, removed: removed.length };
}
