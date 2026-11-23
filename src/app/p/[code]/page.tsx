import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageInventory } from "@/lib/auth/access";
import { normalizeCode } from "@/lib/masterdata";
import { CookieBounce } from "@/components/cookie-bounce";
import { QrLandingMessage } from "@/components/qr-landing";

export const dynamic = "force-dynamic";

/** Opened by scanning an inventory item's QR code: goes to the item's page (store managers). */
export default async function PartQrPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ b?: string }> }) {
  const [{ code: raw }, { b }] = await Promise.all([params, searchParams]);
  const partNo = normalizeCode(decodeURIComponent(raw));
  const user = await getCurrentUser();
  if (!user) {
    if (b !== "1") return <CookieBounce />;
    redirect(`/login?next=${encodeURIComponent(`/p/${partNo}`)}`);
  }
  if (!canManageInventory(user)) return <QrLandingMessage>Inventory items can be opened by store managers only.</QrLandingMessage>;
  const part = await prisma.part.findUnique({ where: { partNo }, select: { id: true } });
  if (!part) return <QrLandingMessage>Item {partNo} was not found. Check the label or ask the store.</QrLandingMessage>;
  redirect(`/inventory/${part.id}`);
}
