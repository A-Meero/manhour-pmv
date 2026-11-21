import { NextResponse } from "next/server";
import { HttpError, readJson, withUser } from "@/lib/http";
import { answerAfterShift, startSession, stopSession } from "@/lib/work-sessions";

type Ctx = { params: Promise<{ id: string }> };

/** The technician's own Start / Stop work on a job card (after scanning its QR code). */
export const POST = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ action?: string }>(request);
  if (body.action === "start") {
    const { stoppedOther } = await startSession(user, id);
    return NextResponse.json({ ok: true, stoppedOther });
  }
  if (body.action === "stop") {
    await stopSession(user, id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "continue" || body.action === "shift-end" || body.action === "keep") {
    await answerAfterShift(user, id, ({ continue: "CONTINUE", "shift-end": "SHIFT_END", keep: "KEEP" } as const)[body.action]);
    return NextResponse.json({ ok: true });
  }
  throw new HttpError(400, "Unknown action.");
});
