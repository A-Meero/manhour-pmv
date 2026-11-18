import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";
import { validateUserBody, type UserBody } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<UserBody>(request);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "User not found.");
  const { name, email } = await validateUserBody(body, id);

  if (id === user.id && ((body.role && body.role !== "ADMIN") || body.active === false)) {
    throw new HttpError(400, "You cannot remove your own admin access or deactivate yourself.");
  }

  const role = body.role ?? existing.role;
  const data: Prisma.UserUncheckedUpdateInput = {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    role,
    ...(body.active !== undefined ? { active: body.active } : {}),
    ...(body.employeeId !== undefined ? { employeeId: body.employeeId || null } : {}),
    canEnterOwnRecords: role === "EMPLOYEE" ? (body.canEnterOwnRecords ?? existing.canEnterOwnRecords) : false,
  };
  const revoke = !!body.password || body.active === false || (body.role && body.role !== existing.role);
  if (body.password) data.passwordHash = await hash(body.password, 10);
  if (revoke) data.sessionVersion = { increment: 1 };

  await prisma.user.update({ where: { id }, data });
  await audit(user.id, "USER_UPDATED", "User", id, { ...body, password: body.password ? "(changed)" : undefined });
  return NextResponse.json({ ok: true });
}, canManageMasterData);
