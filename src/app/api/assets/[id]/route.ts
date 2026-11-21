import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageAssets } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { updateAsset, type AssetBody } from "@/lib/assets";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<AssetBody>(request);
  await updateAsset(id, body);
  await audit(user.id, "ASSET_UPDATED", "Asset", id, body);
  return NextResponse.json({ ok: true });
}, canManageAssets);

export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id }, include: { _count: { select: { jobCards: true } } } });
  if (!asset) throw new HttpError(404, "Asset not found.");
  if (asset._count.jobCards) throw new HttpError(409, `This asset has ${asset._count.jobCards} job card(s). Deactivate it instead.`);
  await prisma.asset.delete({ where: { id } });
  await audit(user.id, "ASSET_DELETED", "Asset", id, { code: asset.code });
  return NextResponse.json({ ok: true });
}, canManageAssets);
