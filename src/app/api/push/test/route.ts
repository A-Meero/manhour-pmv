import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withUser } from "@/lib/http";
import { sendPush } from "@/lib/push";

/** Sends a test push to the signed-in user's devices (not saved as an in-app notification). */
export const POST = withUser(async (_request, user) => {
  const devices = await prisma.pushSubscription.count({ where: { userId: user.id } });
  const sent = await sendPush([user.id], { kind: "TEST", title: "Test notification", body: "Push notifications work on this device.", link: "/account" });
  return NextResponse.json({ devices, sent });
});
