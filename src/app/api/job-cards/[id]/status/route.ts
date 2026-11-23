import { NextResponse } from "next/server";
import { mayCloseJobCards } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { setJobCardStatus } from "@/lib/job-cards";

type Ctx = { params: Promise<{ id: string }> };

/** Close or reopen a job card. 409 { details: { blockers, canForce } } when something is still to do; admins resend with force. */
export const POST = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ status?: string; force?: boolean }>(request);
  if (body.status !== "OPEN" && body.status !== "CLOSED") throw new HttpError(400, "Status must be OPEN or CLOSED.");
  const result = await setJobCardStatus(user, id, body.status, body.force === true);
  return NextResponse.json({ ok: true, ...result });
}, mayCloseJobCards);
