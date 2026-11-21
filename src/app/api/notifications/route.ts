import { NextResponse } from "next/server";
import { withUser } from "@/lib/http";
import { latest, toClient, unreadCount } from "@/lib/notifications";

/** The bell: unread count and the latest notifications. */
export const GET = withUser(async (_request, user) => {
  const [unread, items] = await Promise.all([unreadCount(user.id), latest(user.id, 10)]);
  return NextResponse.json({ unread, items: items.map(toClient) });
});
