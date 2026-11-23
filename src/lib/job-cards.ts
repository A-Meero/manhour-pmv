import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { can, isSupervisor } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import { stopAllOnCard } from "@/lib/work-sessions";
import { audit } from "@/lib/audit";
import { assertCanReopen } from "@/lib/job-card-entry";

/** "Close job cards" closes any card; supervisors close cards that one of their employees worked on. */
export async function canCloseCard(user: CurrentUser, jobCardId: string) {
  if (can(user, "jobcards.close")) return true;
  if (!isSupervisor(user)) return false;
  const ids = user.supervisedEmployeeIds;
  const [sessions, records] = await Promise.all([
    prisma.workSession.count({ where: { jobCardId, employeeId: { in: ids } } }),
    prisma.manHourRecord.count({ where: { jobCardId, employeeId: { in: ids } } }),
  ]);
  return sessions + records > 0;
}

/** What still has to be done before a job card is closed (empty = it can be closed). */
export async function closeBlockers(jobCardId: string): Promise<string[]> {
  const [card, openRequests, running] = await Promise.all([
    prisma.jobCard.findUnique({ where: { id: jobCardId }, select: { documentRequired: true, photoPath: true } }),
    prisma.partRequest.count({ where: { jobCardId, status: { not: "FULFILLED" } } }),
    prisma.workSession.count({ where: { jobCardId, endedAt: null } }),
  ]);
  const blockers: string[] = [];
  if (card?.documentRequired && !card.photoPath) blockers.push("Its document (created in Oracle) has not been uploaded yet.");
  if (openRequests) blockers.push(`${openRequests} part request${openRequests > 1 ? "s are" : " is"} not fulfilled yet.`);
  if (running) blockers.push(`${running} ${running > 1 ? "people are" : "person is"} still working on it (running QR session${running > 1 ? "s" : ""}).`);
  return blockers;
}

/**
 * Closing stops running sessions (adding their time) and blocks new sessions, part issues and non-admin records.
 * A card with something still to do (closeBlockers) can't be closed, except by an admin who confirms (`force`).
 */
export async function setJobCardStatus(user: CurrentUser, jobCardId: string, status: "OPEN" | "CLOSED", force = false) {
  const card = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
  if (!card) throw new HttpError(404, "Job card not found.");
  if (!(await canCloseCard(user, jobCardId))) {
    throw new HttpError(403, "You can only close or reopen job cards that your employees worked on.");
  }
  if (card.status === status) return { stopped: 0 };
  if (status === "OPEN") await assertCanReopen(user, card);
  const blockers = status === "CLOSED" ? await closeBlockers(jobCardId) : [];
  if (blockers.length && !(user.isAdmin && force)) {
    throw new HttpError(
      409,
      user.isAdmin ? "This job card still has things to do. Close it anyway?" : "This job card can't be closed yet.",
      { blockers, canForce: user.isAdmin },
    );
  }
  const stopped = await prisma.$transaction(async (tx) => {
    const count = status === "CLOSED" ? await stopAllOnCard(tx, jobCardId, user.id) : 0;
    await tx.jobCard.update({
      where: { id: jobCardId },
      data: status === "CLOSED" ? { status, closedAt: new Date(), closedById: user.id } : { status, closedAt: null, closedById: null },
    });
    return count;
  });
  await audit(user.id, status === "CLOSED" ? "JOB_CARD_CLOSED" : "JOB_CARD_REOPENED", "JobCard", jobCardId, {
    code: card.code,
    stoppedSessions: stopped,
    ...(blockers.length ? { closedAnywayByAdmin: blockers } : {}),
  });
  return { stopped };
}
