import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Replaces the group's members with the given user ids. */
export const PUT = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ userIds?: unknown }>(request);
  if (!Array.isArray(body.userIds) || body.userIds.some((v) => typeof v !== "string")) throw new HttpError(400, "Invalid users.");
  const userIds = Array.from(new Set(body.userIds as string[]));
  const group = await prisma.permissionGroup.findUnique({ where: { id }, include: { members: { select: { userId: true } } } });
  if (!group) throw new HttpError(404, "Group not found.");
  if ((await prisma.user.count({ where: { id: { in: userIds } } })) !== userIds.length) throw new HttpError(400, "A user was not found.");
  const before = new Set(group.members.map((m) => m.userId));
  await prisma.$transaction([
    prisma.userGroup.deleteMany({ where: { groupId: id, userId: { notIn: userIds } } }),
    prisma.userGroup.createMany({ data: userIds.filter((userId) => !before.has(userId)).map((userId) => ({ userId, groupId: id })) }),
  ]);
  await audit(user.id, "PERMISSION_GROUP_MEMBERS", "PermissionGroup", id, {
    added: userIds.filter((u) => !before.has(u)),
    removed: [...before].filter((u) => !userIds.includes(u)),
  });
  return NextResponse.json({ ok: true });
}, canManageSettings);
