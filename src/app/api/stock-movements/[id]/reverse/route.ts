import { NextResponse } from "next/server";
import { canManageInventory } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { reverseIssue } from "@/lib/inventory";

type Ctx = { params: Promise<{ id: string }> };

/** Returns a mistakenly issued line to stock: { note } */
export const POST = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ note?: string }>(request);
  await reverseIssue(user, id, body.note);
  return NextResponse.json({ ok: true });
}, canManageInventory);
