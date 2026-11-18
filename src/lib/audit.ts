import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId = "",
  details: unknown = {},
) {
  try {
    await prisma.auditLog.create({ data: { userId, action, entity, entityId, details: JSON.parse(JSON.stringify(details ?? {})) as Prisma.InputJsonValue } });
  } catch (error) {
    console.error("Audit log failed", error);
  }
}
