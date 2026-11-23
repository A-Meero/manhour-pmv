import { NextResponse } from "next/server";
import { canManageInventory } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { updatePartRequestLine } from "@/lib/part-requests";

type Ctx = { params: Promise<{ id: string }> };

/** Store manager, on one request line: { action: "mr", mrNumber } | { action: "done" } | { action: "reopen" } */
export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  await updatePartRequestLine(user, id, await readJson<{ action?: unknown; mrNumber?: unknown }>(request));
  return NextResponse.json({ ok: true });
}, canManageInventory);
