import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { sendPush } from "@/lib/push";

export type NotificationKind =
  | "SHIFT_REMINDER"
  | "LIMIT_STOP"
  | "LOW_STOCK"
  | "SESSION_REVIEW"
  | "JOB_CARD_RECEIVED"
  | "PART_REQUEST"
  | "PART_REQUEST_UPDATE"
  | "JOB_CARD_ASSIGNED"
  | "DOCUMENT_NEEDED"
  | "TEST";

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * Sends an in-app notification to each user, and a push notification to their subscribed devices (unless muted).
 * With a dedupeKey, a user gets that event only once (e.g. one reminder per work session), however many times this runs.
 */
export async function notify(
  userIds: string[],
  message: { kind: NotificationKind; title: string; body?: string; link?: string; dedupeKey?: string },
  db: Client = prisma,
) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return 0;
  // Users who already had this event don't get it pushed again.
  const already = message.dedupeKey
    ? new Set((await db.notification.findMany({ where: { userId: { in: ids }, dedupeKey: message.dedupeKey }, select: { userId: true } })).map((n) => n.userId))
    : new Set<string>();
  const fresh = ids.filter((id) => !already.has(id));
  if (fresh.length) void sendPush(fresh, message);
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

/** Active logins linked to an employee */
export async function usersOfEmployee(employeeId: string, db: Client = prisma) {
  const users = await db.user.findMany({ where: { employeeId, active: true }, select: { id: true } });
  return users.map((u) => u.id);
}

/** Tells the received-by employee (their login, if they have one) that a job card was received by them. */
export async function notifyReceivedBy(card: {
  id: string;
  code: string;
  receivedById: string | null;
  asset?: { code: string; description: string } | null;
}) {
  if (!card.receivedById) return 0;
  const asset = card.asset ? ` (${[card.asset.code, card.asset.description].filter(Boolean).join(" – ")})` : "";
  return notify(await usersOfEmployee(card.receivedById), {
    kind: "JOB_CARD_RECEIVED",
    title: `Job card ${card.code}${asset} was received by you`,
    body: "Open it to see the details or to request spare parts from the store.",
    link: `/job-cards/${card.id}`,
    dedupeKey: `received:${card.id}:${card.receivedById}`,
  });
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
