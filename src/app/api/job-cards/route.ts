import { NextResponse } from "next/server";
import { canAddByPhoto, canAddJobCards, canAddTyped } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { createJobCard, type JobCardBody } from "@/lib/job-card-entry";

/**
 * Add a job card from the review screen: the printed header, type, asset, received-by employee and work done lines.
 * With a photo / PDF of the card it needs "Add job cards (photo / PDF, Excel)"; typed in, "Add job cards by typing".
 */
export const POST = withUser(async (request, user) => {
  const body = await readJson<JobCardBody>(request);
  const fromPhoto = !!body.photoPath;
  if (fromPhoto && !canAddByPhoto(user)) throw new HttpError(403, "You are not allowed to add job cards from a photo or PDF.");
  if (!fromPhoto && !canAddTyped(user)) throw new HttpError(403, "You are not allowed to add job cards by typing them in.");
  const card = await createJobCard(user, body, fromPhoto ? "PHOTO" : "MANUAL");
  return NextResponse.json({ id: card.id, code: card.code });
}, canAddJobCards);
