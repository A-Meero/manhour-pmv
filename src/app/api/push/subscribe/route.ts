import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError, readJson, withUser } from "@/lib/http";

type Body = { subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; endpoint?: unknown };

const validEndpoint = (value: unknown): value is string => typeof value === "string" && /^https:\/\/\S{10,2000}$/.test(value);

/** This browser / phone wants push notifications for the signed-in user (a device belongs to the last user who subscribed it). */
export const POST = withUser(async (request, user) => {
  const body = await readJson<Body>(request);
  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!validEndpoint(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
    throw new HttpError(400, "Invalid push subscription.");
  }
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 300);
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userId: user.id, userAgent },
    update: { p256dh, auth, userId: user.id, userAgent },
  });
  return NextResponse.json({ ok: true });
});

/** Stop push notifications on this device. */
export const DELETE = withUser(async (request, user) => {
  const body = await readJson<Body>(request);
  if (!validEndpoint(body.endpoint)) throw new HttpError(400, "Invalid push subscription.");
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
});
