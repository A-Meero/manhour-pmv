import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canUploadDocument } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { removeJobCardFile, storeJobCardFile } from "@/lib/job-card-files";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Upload (or replace) the job card's document: the card as created in Oracle (PDF or photo), form field "file".
 * It becomes the card's attachment ("Original card") and clears the yellow "Upload document".
 */
export const POST = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const card = await prisma.jobCard.findUnique({ where: { id }, select: { id: true, code: true, photoPath: true } });
  if (!card) throw new HttpError(404, "Job card not found.");
  const { photoPath, fileName } = await storeJobCardFile(await request.formData().catch(() => null), "file");
  await prisma.jobCard.update({ where: { id }, data: { photoPath } });
  if (card.photoPath && card.photoPath !== photoPath) await removeJobCardFile(card.photoPath);
  await audit(user.id, card.photoPath ? "JOB_CARD_DOCUMENT_REPLACED" : "JOB_CARD_DOCUMENT_UPLOADED", "JobCard", id, { code: card.code, photoPath, fileName });
  return NextResponse.json({ ok: true, photoPath });
}, canUploadDocument);
