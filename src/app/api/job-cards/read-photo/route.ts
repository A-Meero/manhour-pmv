import { NextResponse } from "next/server";
import { canAddByPhoto } from "@/lib/auth/access";
import { withUser } from "@/lib/http";
import { storeJobCardFile } from "@/lib/job-card-files";
import { readJobCardPhoto } from "@/lib/job-card-photo";
import { audit } from "@/lib/audit";

/**
 * Upload a photo (or PDF) of the printed job card. It is stored and read by the AI providers; the extracted
 * details come back for the review screen. Nothing is created until the user saves.
 */
export const POST = withUser(async (request, user) => {
  const { photoPath, mimeType, buffer } = await storeJobCardFile(await request.formData().catch(() => null));
  const result = await readJobCardPhoto(buffer, mimeType);
  await audit(user.id, "JOB_CARD_PHOTO_READ", "JobCard", "", { photoPath, engine: result.engine, number: result.draft.code, error: result.error || undefined });
  return NextResponse.json({ photoPath, mimeType, ...result });
}, canAddByPhoto);
