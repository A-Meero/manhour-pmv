import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { readGroup, type GroupBody } from "@/lib/permission-groups";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const existing = await prisma.permissionGroup.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Group not found.");
  const data = await readGroup(await readJson<GroupBody>(request), id);
  await prisma.permissionGroup.update({ where: { id }, data });
  await audit(user.id, "PERMISSION_GROUP_UPDATED", "PermissionGroup", id, { before: existing.permissions, ...data });
  return NextResponse.json({ ok: true });
}, canManageSettings);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const existing = await prisma.permissionGroup.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
  if (!existing) throw new HttpError(404, "Group not found.");
  await prisma.permissionGroup.delete({ where: { id } });
  await audit(user.id, "PERMISSION_GROUP_DELETED", "PermissionGroup", id, { name: existing.name, members: existing._count.members });
  return NextResponse.json({ ok: true });
}, canManageSettings);
