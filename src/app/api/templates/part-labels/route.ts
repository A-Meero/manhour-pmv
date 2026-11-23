import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/auth/access";
import { withUser } from "@/lib/http";
import { appOrigin, partLink } from "@/lib/qr";
import { buildQrLabelsPdf } from "@/lib/qr-labels";

/** Printable inventory item QR labels. ?ids=a,b,c for chosen items, otherwise every active item. */
export const GET = withUser(async (request) => {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const parts = await prisma.part.findMany({
    where: ids.length ? { id: { in: ids.slice(0, 1000) } } : { active: true },
    orderBy: { partNo: "asc" },
    take: 3000,
    select: { partNo: true, name: true },
  });
  const origin = await appOrigin(request);
  const logo = await readFile(path.join(process.cwd(), "public", "ahmadiah-a.png")).catch(() => null);
  const pdf = await buildQrLabelsPdf(
    parts.map((part) => ({ code: part.partNo, link: partLink(origin, part.partNo), hint: part.name || "Inventory item" })),
    logo ? new Uint8Array(logo) : undefined,
    { title: "Inventory QR labels", empty: "No items to print." },
  );
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="inventory-qr-labels.pdf"`, "Cache-Control": "no-store" },
  });
}, canManageInventory);
