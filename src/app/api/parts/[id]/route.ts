import { NextResponse } from "next/server";
import { canManageInventory } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { updatePart, type PartBody } from "@/lib/inventory";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  await updatePart(user, id, await readJson<PartBody>(request));
  return NextResponse.json({ ok: true });
}, canManageInventory);
