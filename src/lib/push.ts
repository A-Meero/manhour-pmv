import "server-only";

import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

/**
 * Push notifications (Web Push with VAPID keys): every in-app notification is also sent to the user's subscribed
 * browsers / phones, unless they muted that kind (Account page). Needs https and internet on the server.
 * Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (/ VAPID_SUBJECT) from the environment, otherwise generated once and kept
 * in the Setting table.
 */

const KEY_SETTING = "vapidKeys";
let cached: { publicKey: string; privateKey: string } | null = null;

export async function vapidKeys() {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const row = await prisma.setting.findUnique({ where: { key: KEY_SETTING } });
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as { publicKey?: string; privateKey?: string };
      if (parsed.publicKey && parsed.privateKey) return (cached = { publicKey: parsed.publicKey, privateKey: parsed.privateKey });
    } catch {
      // regenerate below
    }
  }
  const keys = webpush.generateVAPIDKeys();
  // Keep whichever pair was saved first if two requests generate at the same moment.
  await prisma.setting.upsert({ where: { key: KEY_SETTING }, create: { key: KEY_SETTING, value: JSON.stringify(keys) }, update: {} });
  const saved = await prisma.setting.findUniqueOrThrow({ where: { key: KEY_SETTING } });
  cached = JSON.parse(saved.value) as { publicKey: string; privateKey: string };
  return cached;
}

/** Who the push services can contact about this sender: VAPID_SUBJECT, the https app address, or a placeholder. */
async function subject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const { appBaseUrl } = await getSettings();
  return appBaseUrl.startsWith("https://") ? appBaseUrl : "mailto:noreply@manhour.invalid";
}

export type PushMessage = { kind: string; title: string; body?: string; link?: string };

/** Sends a push to every device of these users (except those who muted the kind). Never throws. */
export async function sendPush(userIds: string[], message: PushMessage) {
  try {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (!ids.length) return 0;
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: ids }, user: { active: true, NOT: { mutedPushKinds: { has: message.kind } } } },
    });
    if (!subscriptions.length) return 0;
    const keys = await vapidKeys();
    const options = { vapidDetails: { subject: await subject(), publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 24 * 3600 };
    const payload = JSON.stringify({ title: message.title, body: message.body ?? "", url: message.link || "/notifications", tag: message.kind });
    let sent = 0;
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, options);
          sent += 1;
          await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // Gone / not found: the browser dropped this subscription.
          if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          else console.warn(`[push] ${status ?? ""} ${(error as Error).message}`);
        }
      }),
    );
    return sent;
  } catch (error) {
    console.warn("[push] failed:", (error as Error).message);
    return 0;
  }
}
