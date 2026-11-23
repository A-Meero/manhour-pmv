import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewAssets } from "@/lib/auth/access";
import { normalizeCode } from "@/lib/masterdata";
import { CookieBounce } from "@/components/cookie-bounce";
import { QrLandingMessage } from "@/components/qr-landing";

export const dynamic = "force-dynamic";

/** Opened by scanning an asset's QR code: goes to the asset's page. */
export default async function AssetQrPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ b?: string }> }) {
  const [{ code: raw }, { b }] = await Promise.all([params, searchParams]);
  const code = normalizeCode(decodeURIComponent(raw));
  const user = await getCurrentUser();
  if (!user) {
    if (b !== "1") return <CookieBounce />;
    redirect(`/login?next=${encodeURIComponent(`/a/${code}`)}`);
  }
  if (!canViewAssets(user)) return <QrLandingMessage>You don&apos;t have access to assets. Ask an admin for the &quot;View assets&quot; permission.</QrLandingMessage>;
  const asset = await prisma.asset.findUnique({ where: { code }, select: { id: true } });
  if (!asset) return <QrLandingMessage>Asset {code} was not found. Check the label or ask the office.</QrLandingMessage>;
  redirect(`/assets/${asset.id}`);
}
