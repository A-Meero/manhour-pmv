import { NextResponse } from "next/server";
import { canManageInventory } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { issueParts } from "@/lib/inventory";

type Ctx = { params: Promise<{ id: string }> };

/** Store manager issues spare parts to the job card: { lines: [{ partId, qty }], note? } */
export const POST = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ lines?: { partId?: string; qty?: unknown }[]; note?: string }>(request);
  const issued = await issueParts(user, id, body.lines ?? [], body.note);
  return NextResponse.json({ ok: true, issued });
}, canManageInventory);
