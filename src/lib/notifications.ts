import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type NotificationKind = "SHIFT_REMINDER" | "LIMIT_STOP" | "LOW_STOCK" | "SESSION_REVIEW";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Sends an in-app notification to each user. With a dedupeKey, a user gets that event only once
 * (e.g. one reminder per work session), however many times this runs.
 */
export async function notify(
  userIds: string[],
  message: { kind: NotificationKind; title: string; body?: string; link?: string; dedupeKey?: string },
  db: Client = prisma,
) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return 0;
  const result = await db.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      kind: message.kind,
      title: message.title,
      body: message.body ?? "",
      link: message.link ?? "",
      dedupeKey: message.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Supervisors of the employee (active logins), or active admins when there are none. */
export async function supervisorsOrAdmins(employeeId: string, db: Client = prisma) {
  const supervisors = await db.employeeSupervisor.findMany({
    where: { employeeId, supervisor: { active: true } },
    select: { supervisor: { select: { id: true, email: true } } },
  });
  if (supervisors.length) return supervisors.map((s) => s.supervisor);
  return db.user.findMany({ where: { isAdmin: true, active: true }, select: { id: true, email: true } });
}

/** Active users holding a permission through a group, plus active admins. */
export async function usersWithPermission(permission: string, db: Client = prisma) {
  const users = await db.user.findMany({
    where: { active: true, OR: [{ isAdmin: true }, { groups: { some: { group: { permissions: { has: permission } } } } }] },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function latest(userId: string, take = 10) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export const toClient = (n: { id: string; kind: string; title: string; body: string; link: string; readAt: Date | null; createdAt: Date }) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  link: n.link,
  read: !!n.readAt,
  createdAt: n.createdAt.toISOString(),
});
