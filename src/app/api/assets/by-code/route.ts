import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAddJobCards, canEditJobCards, canViewAssets } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { normalizeCode } from "@/lib/masterdata";

/** One asset by code (scanned from its QR on the job card form): ?code=<asset code> */
export const GET = withUser(async (request) => {
  const code = normalizeCode(new URL(request.url).searchParams.get("code"));
  if (!code) throw new HttpError(400, "Asset code is missing.");
  const asset = await prisma.asset.findUnique({
    where: { code },
    select: { id: true, code: true, description: true, plateNo: true, chassisNo: true, yearOfMake: true, active: true },
  });
  if (!asset) throw new HttpError(404, `Asset ${code} was not found.`);
  return NextResponse.json({ asset });
}, (user) => canAddJobCards(user) || canEditJobCards(user) || canViewAssets(user));
