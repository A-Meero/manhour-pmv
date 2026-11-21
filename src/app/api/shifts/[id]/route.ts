import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageEmployees } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { readShift, type ShiftBody } from "@/lib/shift-body";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, "Shift not found.");
  const body = await readJson<ShiftBody>(request);
  const data = readShift({ ...existing, ...body });
  const clash = await prisma.shift.findFirst({ where: { name: data.name, id: { not: id } } });
  if (clash) throw new HttpError(409, `A shift named "${data.name}" already exists.`);
  await prisma.shift.update({ where: { id }, data });
  await audit(user.id, "SHIFT_UPDATED", "Shift", id, { before: existing, after: data });
  return NextResponse.json({ ok: true });
}, canManageEmployees);

/** Employees on a deleted shift simply have no shift afterwards. */
export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const shift = await prisma.shift.findUnique({ where: { id }, include: { _count: { select: { employees: true } } } });
  if (!shift) throw new HttpError(404, "Shift not found.");
  await prisma.shift.delete({ where: { id } });
  await audit(user.id, "SHIFT_DELETED", "Shift", id, { name: shift.name, employees: shift._count.employees });
  return NextResponse.json({ ok: true });
}, canManageEmployees);
