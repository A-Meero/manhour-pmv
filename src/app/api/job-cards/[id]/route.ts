import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { normalizeCode } from "@/lib/masterdata";
import { getFieldDefinitions, toFieldDefs, validateCustomFields } from "@/lib/fields";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ code?: string; active?: boolean; customFields?: Record<string, unknown> }>(request);
  const existing = await prisma.jobCard.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Job card not found.");
  const code = body.code !== undefined ? normalizeCode(body.code) : existing.code;
  if (!code) throw new HttpError(400, "Job card ID is required.");
  if (code !== existing.code) {
    if (await prisma.jobCard.findUnique({ where: { code } })) throw new HttpError(409, `Job card ${code} already exists.`);
  }
  let customFields = existing.customFields as Record<string, unknown>;
  if (body.customFields) {
    const custom = validateCustomFields(toFieldDefs(await getFieldDefinitions("JOB_CARD")), body.customFields);
    if (custom.errors.length) throw new HttpError(400, custom.errors.join("; "));
    customFields = custom.values;
  }
  await prisma.jobCard.update({
    where: { id },
    data: { code, active: body.active ?? existing.active, customFields: customFields as Prisma.InputJsonValue },
  });
  await audit(user.id, "JOB_CARD_UPDATED", "JobCard", id, body);
  return NextResponse.json({ ok: true });
}, canManageMasterData);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const [count, sessions, movements] = await Promise.all([
    prisma.manHourRecord.count({ where: { jobCardId: id } }),
    prisma.workSession.count({ where: { jobCardId: id } }),
    prisma.stockMovement.count({ where: { jobCardId: id } }),
  ]);
  if (count > 0) throw new HttpError(409, `This job card is used by ${count} record(s). Deactivate it instead.`);
  if (sessions + movements > 0) throw new HttpError(409, "This job card has work sessions or issued parts. Deactivate it instead.");
  await prisma.jobCard.delete({ where: { id } });
  await audit(user.id, "JOB_CARD_DELETED", "JobCard", id);
  return NextResponse.json({ ok: true });
}, canManageMasterData);
