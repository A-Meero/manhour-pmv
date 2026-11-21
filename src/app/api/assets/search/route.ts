import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAddJobCards, canEditJobCards, canViewAssets } from "@/lib/auth/access";
import { withUser } from "@/lib/http";

/** Asset picker on the job card form: code, description, plate or chassis. */
export const GET = withUser(async (request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ assets: [] });
  const ident = q.replace(/\s+/g, "").toUpperCase();
  const assets = await prisma.asset.findMany({
    where: {
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { plateNo: { contains: ident } },
        { chassisNo: { contains: ident } },
      ],
    },
    select: { id: true, code: true, description: true, plateNo: true, chassisNo: true, active: true },
    orderBy: [{ active: "desc" }, { code: "asc" }],
    take: 15,
  });
  return NextResponse.json({ assets });
}, (user) => canAddJobCards(user) || canEditJobCards(user) || canViewAssets(user));
