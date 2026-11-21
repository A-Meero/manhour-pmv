import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canEditJobCards } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { unlink } from "fs/promises";
import path from "path";
import { jobCardPhotoRoot, updateJobCardDetails, type JobCardBody } from "@/lib/job-card-entry";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  await updateJobCardDetails(user, id, await readJson<JobCardBody & { active?: boolean }>(request));
  return NextResponse.json({ ok: true });
}, canEditJobCards);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const [count, sessions, movements] = await Promise.all([
    prisma.manHourRecord.count({ where: { jobCardId: id } }),
    prisma.workSession.count({ where: { jobCardId: id } }),
    prisma.stockMovement.count({ where: { jobCardId: id } }),
  ]);
  if (count > 0) throw new HttpError(409, `This job card is used by ${count} record(s). Deactivate it instead.`);
  if (sessions + movements > 0) throw new HttpError(409, "This job card has work sessions or issued parts. Deactivate it instead.");
  const card = await prisma.jobCard.delete({ where: { id } });
  if (card.photoPath) await unlink(path.join(jobCardPhotoRoot(), card.photoPath)).catch(() => undefined);
  await audit(user.id, "JOB_CARD_DELETED", "JobCard", id);
  return NextResponse.json({ ok: true });
}, canEditJobCards);
