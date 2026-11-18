import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ active?: boolean }>(request);
  await prisma.apiKey.update({ where: { id }, data: { active: !!body.active } });
  await audit(user.id, body.active ? "API_KEY_ENABLED" : "API_KEY_DISABLED", "ApiKey", id);
  return NextResponse.json({ ok: true });
}, canManageMasterData);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  await prisma.apiKey.delete({ where: { id } });
  await audit(user.id, "API_KEY_DELETED", "ApiKey", id);
  return NextResponse.json({ ok: true });
}, canManageMasterData);
