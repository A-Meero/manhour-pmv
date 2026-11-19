import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { canEnterRecords, methodAllowed } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import type { LoggingMethod } from "@/lib/logging-methods";

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePage(check: (user: CurrentUser) => boolean): Promise<CurrentUser> {
  const user = await requireUser();
  if (!check(user)) redirect("/unauthorized");
  return user;
}

/** Pages of a record-entry way (New Entry, Import, Scan Sheet): needs entry rights and the way switched on. */
export async function requireMethodPage(method: LoggingMethod): Promise<CurrentUser> {
  const user = await requirePage(canEnterRecords);
  const { methods } = await getSettings();
  if (!methodAllowed(user, methods, method)) redirect("/unauthorized?reason=method");
  return user;
}
