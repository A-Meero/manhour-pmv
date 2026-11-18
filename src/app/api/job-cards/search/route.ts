import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canEnterRecords, canViewAnalytics } from "@/lib/auth/access";
import { withUser } from "@/lib/http";

/** Autocomplete for active job card IDs. */
export const GET = withUser(async (request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim().toUpperCase() ?? "";
  const cards = await prisma.jobCard.findMany({
    where: { active: true, ...(q ? { code: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { code: "asc" },
    take: 20,
    select: { code: true },
  });
  return NextResponse.json(cards.map((card) => card.code));
}, (user) => canEnterRecords(user) || canViewAnalytics(user));
