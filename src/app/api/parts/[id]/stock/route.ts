import { NextResponse } from "next/server";
import { canManageInventory } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { changeStock } from "@/lib/inventory";

type Ctx = { params: Promise<{ id: string }> };

/** { kind: "RECEIVE", qty, unitCost? } or { kind: "ADJUST", countedQty, note } */
export const POST = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  await changeStock(user, id, await readJson(request));
  return NextResponse.json({ ok: true });
}, canManageInventory);
