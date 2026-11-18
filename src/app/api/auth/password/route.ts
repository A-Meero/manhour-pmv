import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie } from "@/lib/auth/session";
import { HttpError, readJson, withUser } from "@/lib/http";

export const POST = withUser(async (request, user) => {
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
  if (!body.newPassword || body.newPassword.length < 8) throw new HttpError(400, "New password must be at least 8 characters.");
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!body.currentPassword || !(await compare(body.currentPassword, record.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect.");
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hash(body.newPassword, 10), sessionVersion: { increment: 1 } },
  });
  const response = NextResponse.json({ ok: true });
  attachSessionCookie(response, user.id, updated.sessionVersion);
  return response;
});
