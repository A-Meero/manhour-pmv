import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/http";
import { createPartRequest } from "@/lib/part-requests";

type Ctx = { params: Promise<{ id: string }> };

/** Request spare parts for the job card: { lines: [{ description, qty }], note? }. Its received-by leader, his supervisors, admins. */
export const POST = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const created = await createPartRequest(user, id, await readJson<{ lines?: { description?: unknown; qty?: unknown }[]; text?: unknown; note?: unknown }>(request));
  return NextResponse.json({ id: created.id });
});
