import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { canBrowseJobCards } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { appOrigin, jobCardLink } from "@/lib/qr";
import { buildQrLabelsPdf } from "@/lib/qr-labels";

/** Printable QR labels. ?ids=a,b,c for chosen cards, or ?status=open for every open, active card. */
export const GET = withUser(async (request) => {
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  const openOnly = url.searchParams.get("status") === "open";
  if (!ids.length && !openOnly) throw new HttpError(400, "Choose the job cards to print.");
  const cards = await prisma.jobCard.findMany({
    where: ids.length ? { id: { in: ids.slice(0, 500) } } : { status: "OPEN", active: true },
    orderBy: { code: "asc" },
    take: 1000,
    select: { code: true },
  });
  const origin = await appOrigin(request);
  const logo = await readFile(path.join(process.cwd(), "public", "ahmadiah-a.png")).catch(() => null);
  const pdf = await buildQrLabelsPdf(
    cards.map((card) => ({ code: card.code, link: jobCardLink(origin, card.code) })),
    logo ? new Uint8Array(logo) : undefined,
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="job-card-qr-labels.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}, canBrowseJobCards);
