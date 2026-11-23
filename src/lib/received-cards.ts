import "server-only";

import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth/session";

/**
 * "My Job Cards": cards received by the user's own employee record or by an employee they supervise,
 * plus cards assigned to the user's employee record. null if the user has none of these links.
 */
export function receivedCardsWhere(user: CurrentUser): Prisma.JobCardWhereInput | null {
  const ids = Array.from(new Set([...(user.employeeId ? [user.employeeId] : []), ...user.supervisedEmployeeIds]));
  if (!ids.length) return null;
  const or: Prisma.JobCardWhereInput[] = [{ receivedById: { in: ids } }];
  if (user.employeeId) or.push({ assignments: { some: { employeeId: user.employeeId } } });
  return { OR: or };
}

/** Cards assigned to the user's own employee record */
export function assignedToMeWhere(user: CurrentUser): Prisma.JobCardWhereInput | null {
  return user.employeeId ? { assignments: { some: { employeeId: user.employeeId } } } : null;
}
