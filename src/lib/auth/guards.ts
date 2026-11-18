import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

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
