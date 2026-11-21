import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { readGroup, type GroupBody } from "@/lib/permission-groups";
import { audit } from "@/lib/audit";

export const POST = withUser(async (request, user) => {
  const data = await readGroup(await readJson<GroupBody>(request));
  const group = await prisma.permissionGroup.create({ data: { name: data.name!, description: data.description ?? "", permissions: data.permissions ?? [] } });
  await audit(user.id, "PERMISSION_GROUP_CREATED", "PermissionGroup", group.id, data);
  return NextResponse.json({ id: group.id });
}, canManageSettings);
