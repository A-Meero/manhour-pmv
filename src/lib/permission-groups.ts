import "server-only";

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import { isPermission, PERMISSION_KEYS } from "@/lib/permissions";

export type GroupBody = { name?: unknown; description?: unknown; permissions?: unknown };

/** Validates a create / update body. Unknown permission names are rejected. */
export async function readGroup(body: GroupBody, existingId?: string) {
  const out: { name?: string; description?: string; permissions?: string[] } = {};
  if (body.name !== undefined || !existingId) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) throw new HttpError(400, "Group name is required.");
    if (name.length > 60) throw new HttpError(400, "Group name is too long (60 characters max).");
    const clash = await prisma.permissionGroup.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, ...(existingId ? { id: { not: existingId } } : {}) },
    });
    if (clash) throw new HttpError(409, `A group called "${clash.name}" already exists.`);
    out.name = name;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string") throw new HttpError(400, "Invalid description.");
    out.description = body.description.trim().slice(0, 200);
  }
  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions) || !body.permissions.every(isPermission)) throw new HttpError(400, "Unknown permission.");
    // Keep the list in the screen's order, without duplicates.
    out.permissions = PERMISSION_KEYS.filter((key) => (body.permissions as string[]).includes(key));
  }
  return out;
}
