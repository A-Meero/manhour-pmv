import { NextResponse } from "next/server";
import { canAddJobCards } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { createJobCard, importJobCards, type JobCardBody } from "@/lib/job-card-entry";

/**
 * Add a job card from the review screen (photo or typed): the printed header, asset and work done lines.
 * Quick add of bare numbers (one per line) is still accepted as { codes }.
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson<JobCardBody & { codes?: string[] | string; fromPhoto?: boolean }>(request);
  if (body.codes !== undefined) {
    const codes = (Array.isArray(body.codes) ? body.codes : String(body.codes ?? "").split(/[\n,;]/)).map((code) => code.trim()).filter(Boolean);
    if (codes.length === 0) throw new HttpError(400, "Enter at least one job card ID.");
    const summary = await importJobCards(
      codes.map((code, index) => ({ row: index + 1, code, fields: body.customFields })),
      { source: "MANUAL", actorId: user.id, isAdmin: user.isAdmin },
      codes.length > 1,
    );
    return NextResponse.json(summary);
  }
  const card = await createJobCard(user, body, body.photoPath ? "PHOTO" : "MANUAL");
  return NextResponse.json({ id: card.id, code: card.code });
}, canAddJobCards);
