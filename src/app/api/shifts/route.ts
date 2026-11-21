import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageEmployees } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { readShift, type ShiftBody } from "@/lib/shift-body";
import { audit } from "@/lib/audit";

export const POST = withUser(async (request, user) => {
  const data = readShift(await readJson<ShiftBody>(request));
  if (await prisma.shift.findUnique({ where: { name: data.name } })) throw new HttpError(409, `A shift named "${data.name}" already exists.`);
  const shift = await prisma.shift.create({ data });
  await audit(user.id, "SHIFT_CREATED", "Shift", shift.id, data);
  return NextResponse.json({ id: shift.id });
}, canManageEmployees);
