import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageUsers } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";
import { validateUserBody, type UserBody } from "@/lib/users";

export const POST = withUser(async (request, user) => {
  const body = await readJson<UserBody>(request);
  if (!body.name || !body.email || !body.password) {
    throw new HttpError(400, "Name, email and password are required.");
  }
  const { name, email, groupIds } = await validateUserBody(user, body);
  const created = await prisma.user.create({
    data: {
      name: name!,
      email: email!,
      isAdmin: !!body.isAdmin,
      passwordHash: await hash(body.password, 10),
      active: body.active ?? true,
      employeeId: body.employeeId || null,
      groups: groupIds?.length ? { create: groupIds.map((groupId) => ({ groupId })) } : undefined,
    },
  });
  await audit(user.id, "USER_CREATED", "User", created.id, { email: created.email, isAdmin: created.isAdmin, groupIds });
  return NextResponse.json({ id: created.id });
}, canManageUsers);
