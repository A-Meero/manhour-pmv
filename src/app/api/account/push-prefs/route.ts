import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, withUser } from "@/lib/http";
import { MUTABLE_KINDS } from "@/lib/notification-kinds";

/** { mutedPushKinds: [...] }: notification kinds the signed-in user doesn't want as push (they still appear in the app). */
export const PUT = withUser(async (request, user) => {
  const body = await readJson<{ mutedPushKinds?: unknown }>(request);
  const muted = (Array.isArray(body.mutedPushKinds) ? body.mutedPushKinds : []).map(String).filter((kind) => MUTABLE_KINDS.includes(kind));
  await prisma.user.update({ where: { id: user.id }, data: { mutedPushKinds: Array.from(new Set(muted)) } });
  return NextResponse.json({ ok: true });
});
