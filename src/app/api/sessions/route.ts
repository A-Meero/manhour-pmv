import { NextResponse } from "next/server";
import { canReviewSessions } from "@/lib/auth/access";
import { assertMethod, readJson, withUser } from "@/lib/http";
import { addSession } from "@/lib/work-sessions";

/** Adds a work session a technician forgot to scan (supervisors, managers, admins). */
export const POST = withUser(async (request, user) => {
  await assertMethod(user, "qr");
  const body = await readJson<{ employeeId?: string; jobCardId?: string; startedAt?: string; endedAt?: string; note?: string }>(request);
  await addSession(user, body);
  return NextResponse.json({ ok: true });
}, canReviewSessions);
