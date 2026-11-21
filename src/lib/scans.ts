import "server-only";

import path from "path";
import { appConfig } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { getViewScope, isAdmin, scopeWhere } from "@/lib/auth/access";

export function scanRoot() {
  return path.resolve(process.cwd(), appConfig.uploadDir(), "scans");
}

/** Uploader, admins, or anyone who can see a record created from the scan. */
export async function canAccessScan(user: CurrentUser, scan: { id: string; uploadedById: string | null }) {
  if (isAdmin(user) || scan.uploadedById === user.id) return true;
  const visible = await prisma.manHourRecord.count({ where: { scanId: scan.id, ...scopeWhere(getViewScope(user)) } });
  return visible > 0;
}
