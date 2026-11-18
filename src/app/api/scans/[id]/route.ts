import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Discard a scan that should not be saved (the photo is kept for reference). */
export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const scan = await prisma.scanSheet.findUnique({ where: { id } });
  if (!scan) throw new HttpError(404, "Scan not found.");
  if (!isAdmin(user) && scan.uploadedById !== user.id) throw new HttpError(403, "You can only discard your own scans.");
  await prisma.scanSheet.update({ where: { id }, data: { status: "DISCARDED" } });
  return NextResponse.json({ ok: true });
});
