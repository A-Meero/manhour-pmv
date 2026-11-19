import { NextResponse } from "next/server";
import { canReviewSessions } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { approveSession, deleteSession, editSession } from "@/lib/work-sessions";

type Ctx = { params: Promise<{ id: string }> };

/** Correct a session's times, or mark a flagged session as checked ({ approve: true }). */
export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ startedAt?: string; endedAt?: string | null; note?: string; approve?: boolean }>(request);
  if (body.approve) await approveSession(user, id);
  else await editSession(user, id, body);
  return NextResponse.json({ ok: true });
}, canReviewSessions);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  await deleteSession(user, id);
  return NextResponse.json({ ok: true });
}, canReviewSessions);
