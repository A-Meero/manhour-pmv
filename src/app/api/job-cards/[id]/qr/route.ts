import { prisma } from "@/lib/prisma";
import { canBrowseJobCards } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { appOrigin, jobCardLink, qrPng } from "@/lib/qr";

type Ctx = { params: Promise<{ id: string }> };

/** PNG of the job card's QR code (?download=1 to save it). */
export const GET = withUser<Ctx>(async (request, _user, { params }) => {
  const { id } = await params;
  const card = await prisma.jobCard.findUnique({ where: { id }, select: { code: true } });
  if (!card) throw new HttpError(404, "Job card not found.");
  const png = await qrPng(jobCardLink(await appOrigin(request), card.code));
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      ...(download ? { "Content-Disposition": `attachment; filename="${card.code.replace(/[^A-Za-z0-9._-]/g, "_")}-qr.png"` } : {}),
    },
  });
}, canBrowseJobCards);
