import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Marks one of the user's own notifications as read. */
export const POST = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  await prisma.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
});
