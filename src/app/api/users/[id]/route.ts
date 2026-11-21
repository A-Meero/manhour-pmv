import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";
import { validateUserBody, type UserBody } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<UserBody>(request);
  const existing = await prisma.user.findUnique({ where: { id }, include: { groups: { select: { groupId: true } } } });
  if (!existing) throw new HttpError(404, "User not found.");
  const { name, email, groupIds } = await validateUserBody(user, body, existing);

  if (id === user.id && ((body.isAdmin === false && existing.isAdmin) || body.active === false)) {
    throw new HttpError(400, "You cannot remove your own admin access or deactivate yourself.");
  }

  const data: Prisma.UserUncheckedUpdateInput = {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(body.isAdmin !== undefined ? { isAdmin: !!body.isAdmin } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
    ...(body.employeeId !== undefined ? { employeeId: body.employeeId || null } : {}),
  };
  // Signing out is only needed for password / deactivation / losing admin; permissions are read on every request.
  const revoke = !!body.password || body.active === false || (body.isAdmin === false && existing.isAdmin);
  if (body.password) data.passwordHash = await hash(body.password, 10);
  if (revoke) data.sessionVersion = { increment: 1 };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data });
    if (groupIds) {
      await tx.userGroup.deleteMany({ where: { userId: id, groupId: { notIn: groupIds } } });
      const have = new Set(existing.groups.map((g) => g.groupId));
      const add = groupIds.filter((groupId) => !have.has(groupId));
      if (add.length) await tx.userGroup.createMany({ data: add.map((groupId) => ({ userId: id, groupId })) });
    }
  });
  await audit(user.id, "USER_UPDATED", "User", id, { ...body, password: body.password ? "(changed)" : undefined });
  return NextResponse.json({ ok: true });
}, canManageUsers);
