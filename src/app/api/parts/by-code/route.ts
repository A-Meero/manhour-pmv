import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageInventory } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { normalizeCode } from "@/lib/masterdata";

/** One inventory item by part no. (scanned from its QR): ?code=<part no.> */
export const GET = withUser(async (request) => {
  const partNo = normalizeCode(new URL(request.url).searchParams.get("code"));
  if (!partNo) throw new HttpError(400, "Part no. is missing.");
  const part = await prisma.part.findUnique({ where: { partNo } });
  if (!part) throw new HttpError(404, `Item ${partNo} was not found in the inventory.`);
  return NextResponse.json({
    part: { id: part.id, partNo: part.partNo, name: part.name, unit: part.unit, qtyOnHand: Number(part.qtyOnHand), active: part.active },
  });
}, canManageInventory);
