import { NextResponse } from "next/server";
import type { FieldEntity, FieldType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { slugifyKey } from "@/lib/fields";
import { audit } from "@/lib/audit";

const ENTITIES: FieldEntity[] = ["JOB_CARD", "EMPLOYEE", "RECORD"];
const TYPES: FieldType[] = ["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX"];

export const POST = withUser(async (request, user) => {
  const body = await readJson<{ entity?: FieldEntity; label?: string; type?: FieldType; required?: boolean; options?: string[] }>(request);
  const label = body.label?.trim();
  if (!body.entity || !ENTITIES.includes(body.entity)) throw new HttpError(400, "Choose where the field belongs.");
  if (!label) throw new HttpError(400, "Field name is required.");
  if (!body.type || !TYPES.includes(body.type)) throw new HttpError(400, "Choose a field type.");
  const options = (body.options ?? []).map((option) => option.trim()).filter(Boolean);
  if (body.type === "SELECT" && options.length === 0) throw new HttpError(400, "A list field needs at least one option.");

  const base = slugifyKey(label);
  let key = base;
  for (let n = 2; await prisma.fieldDefinition.findUnique({ where: { entity_key: { entity: body.entity, key } } }); n += 1) {
    key = `${base}_${n}`;
  }
  const count = await prisma.fieldDefinition.count({ where: { entity: body.entity } });
  const field = await prisma.fieldDefinition.create({
    data: { entity: body.entity, key, label, type: body.type, required: !!body.required, options, sortOrder: count },
  });
  await audit(user.id, "FIELD_CREATED", "FieldDefinition", field.id, { entity: field.entity, label });
  return NextResponse.json({ id: field.id });
}, canManageMasterData);
