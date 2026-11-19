import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { createPart, type PartBody } from "@/lib/inventory";

/** Part search for the issue screen: ?q= matches part no. or name; active parts only. */
export const GET = withUser(async (request) => {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const parts = await prisma.part.findMany({
    where: {
      active: true,
      ...(q ? { OR: [{ partNo: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { partNo: "asc" },
    take: 25,
    select: { id: true, partNo: true, name: true, unit: true, qtyOnHand: true, unitCost: true },
  });
  return NextResponse.json({
    parts: parts.map((part) => ({ ...part, qtyOnHand: Number(part.qtyOnHand), unitCost: Number(part.unitCost) })),
  });
}, canManageInventory);

export const POST = withUser(async (request, user) => {
  const body = await readJson<PartBody & { openingQty?: unknown }>(request);
  const part = await createPart(user, body);
  return NextResponse.json({ id: part.id });
}, canManageInventory);
