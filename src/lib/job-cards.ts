import "server-only";

import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { isManagerOrAdmin, isSupervisor } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import { stopAllOnCard } from "@/lib/work-sessions";
import { audit } from "@/lib/audit";

/** Admins and managers close any card; supervisors close cards that one of their employees worked on. */
export async function canCloseCard(user: CurrentUser, jobCardId: string) {
  if (isManagerOrAdmin(user)) return true;
  if (!isSupervisor(user)) return false;
  const ids = user.supervisedEmployeeIds;
  const [sessions, records] = await Promise.all([
    prisma.workSession.count({ where: { jobCardId, employeeId: { in: ids } } }),
    prisma.manHourRecord.count({ where: { jobCardId, employeeId: { in: ids } } }),
  ]);
  return sessions + records > 0;
}

/** Closing stops running sessions (adding their time) and blocks new sessions, part issues and non-admin records. */
export async function setJobCardStatus(user: CurrentUser, jobCardId: string, status: "OPEN" | "CLOSED") {
  const card = await prisma.jobCard.findUnique({ where: { id: jobCardId } });
  if (!card) throw new HttpError(404, "Job card not found.");
  if (!(await canCloseCard(user, jobCardId))) {
    throw new HttpError(403, "You can only close or reopen job cards that your employees worked on.");
  }
  if (card.status === status) return { stopped: 0 };
  const stopped = await prisma.$transaction(async (tx) => {
    const count = status === "CLOSED" ? await stopAllOnCard(tx, jobCardId, user.id) : 0;
    await tx.jobCard.update({
      where: { id: jobCardId },
      data: status === "CLOSED" ? { status, closedAt: new Date(), closedById: user.id } : { status, closedAt: null, closedById: null },
    });
    return count;
  });
  await audit(user.id, status === "CLOSED" ? "JOB_CARD_CLOSED" : "JOB_CARD_REOPENED", "JobCard", jobCardId, { code: card.code, stoppedSessions: stopped });
  return { stopped };
}
