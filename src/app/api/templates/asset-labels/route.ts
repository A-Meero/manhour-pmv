import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { canViewAssets } from "@/lib/auth/access";
import { withUser } from "@/lib/http";
import { appOrigin, assetLink } from "@/lib/qr";
import { buildQrLabelsPdf } from "@/lib/qr-labels";

/** Printable asset QR labels. ?ids=a,b,c for chosen assets, otherwise every active asset. */
export const GET = withUser(async (request) => {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const assets = await prisma.asset.findMany({
    where: ids.length ? { id: { in: ids.slice(0, 1000) } } : { active: true },
    orderBy: { code: "asc" },
    take: 2000,
    select: { code: true, description: true, plateNo: true },
  });
  const origin = await appOrigin(request);
  const logo = await readFile(path.join(process.cwd(), "public", "ahmadiah-a.png")).catch(() => null);
  const pdf = await buildQrLabelsPdf(
    assets.map((asset) => ({ code: asset.code, link: assetLink(origin, asset.code), hint: [asset.description, asset.plateNo].filter(Boolean).join(" · ") || "Asset" })),
    logo ? new Uint8Array(logo) : undefined,
    { title: "Asset QR labels", empty: "No assets to print." },
  );
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="asset-qr-labels.pdf"`, "Cache-Control": "no-store" },
  });
}, canViewAssets);
