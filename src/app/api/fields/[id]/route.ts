import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ label?: string; required?: boolean; options?: string[]; active?: boolean; sortOrder?: number }>(request);
  const field = await prisma.fieldDefinition.findUnique({ where: { id } });
  if (!field) throw new HttpError(404, "Field not found.");
  const label = body.label !== undefined ? body.label.trim() : field.label;
  if (!label) throw new HttpError(400, "Field name is required.");
  const options = body.options ? body.options.map((option) => option.trim()).filter(Boolean) : field.options;
  if (field.type === "SELECT" && options.length === 0) throw new HttpError(400, "A list field needs at least one option.");
  await prisma.fieldDefinition.update({
    where: { id },
    data: {
      label,
      options,
      required: body.required ?? field.required,
      active: body.active ?? field.active,
      sortOrder: body.sortOrder ?? field.sortOrder,
    },
  });
  await audit(user.id, "FIELD_UPDATED", "FieldDefinition", id, body as object);
  return NextResponse.json({ ok: true });
}, canManageMasterData);

/** Removes the field definition. Values already saved stay in the data but are no longer shown. */
export const DELETE = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  await prisma.fieldDefinition.delete({ where: { id } }).catch(() => {
    throw new HttpError(404, "Field not found.");
  });
  await audit(user.id, "FIELD_DELETED", "FieldDefinition", id);
  return NextResponse.json({ ok: true });
}, canManageMasterData);
