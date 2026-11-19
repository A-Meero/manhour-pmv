import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";
import { validateUserBody, type UserBody } from "@/lib/users";

export const POST = withUser(async (request, user) => {
  const body = await readJson<UserBody>(request);
  if (!body.name || !body.email || !body.role || !body.password) {
    throw new HttpError(400, "Name, email, user type and password are required.");
  }
  const { name, email } = await validateUserBody(body);
  const created = await prisma.user.create({
    data: {
      name: name!,
      email: email!,
      role: body.role,
      passwordHash: await hash(body.password, 10),
      active: body.active ?? true,
      employeeId: body.employeeId || null,
      canEnterOwnRecords: body.role === "EMPLOYEE" ? !!body.canEnterOwnRecords : false,
      isStoreManager: !!body.isStoreManager,
    },
  });
  await audit(user.id, "USER_CREATED", "User", created.id, { email: created.email, role: created.role });
  return NextResponse.json({ id: created.id });
}, canManageMasterData);
