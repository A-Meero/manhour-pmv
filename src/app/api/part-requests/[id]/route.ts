import { NextResponse } from "next/server";
import { canManageInventory } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { completePartRequest } from "@/lib/part-requests";

type Ctx = { params: Promise<{ id: string }> };

/** Store manager: { action: "fulfil" } ticks every line of the request done. (Single lines: /api/part-request-lines/[id].) */
export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ action?: unknown }>(request);
  if (body.action !== "fulfil") throw new HttpError(400, "Unknown action.");
  await completePartRequest(user, id);
  return NextResponse.json({ ok: true });
}, canManageInventory);
