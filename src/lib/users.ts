import "server-only";

import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";
import type { CurrentUser } from "@/lib/auth/session";

export type UserBody = {
  name?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
  active?: boolean;
  employeeId?: string | null;
  /** Permission groups; replaces the user's groups when given */
  groupIds?: string[];
};

export async function validateUserBody(actor: CurrentUser, body: UserBody, existing?: { id: string; isAdmin: boolean }) {
  // "Manage users" without being an admin: can't create admins, change admins, or grant admin.
  if (!actor.isAdmin) {
    if (body.isAdmin) throw new HttpError(403, "Only admins can make other users admins.");
    if (existing?.isAdmin) throw new HttpError(403, "Only admins can change an admin's account.");
  }
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  if (body.name !== undefined && !name) throw new HttpError(400, "Name is required.");
  if (body.email !== undefined && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) throw new HttpError(400, "A valid email is required.");
  if (body.password !== undefined && body.password !== "" && body.password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }
  if (email) {
    const clash = await prisma.user.findFirst({ where: { email, ...(existing ? { id: { not: existing.id } } : {}) } });
    if (clash) throw new HttpError(409, "Another user already uses this email.");
  }
  if (body.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: body.employeeId }, include: { user: true } });
    if (!employee) throw new HttpError(400, "Linked employee not found.");
    if (employee.user && employee.user.id !== existing?.id) throw new HttpError(409, `Employee is already linked to ${employee.user.email}.`);
  }
  let groupIds: string[] | undefined;
  if (body.groupIds !== undefined) {
    if (!Array.isArray(body.groupIds) || body.groupIds.some((id) => typeof id !== "string")) throw new HttpError(400, "Invalid groups.");
    groupIds = Array.from(new Set(body.groupIds));
    const found = await prisma.permissionGroup.count({ where: { id: { in: groupIds } } });
    if (found !== groupIds.length) throw new HttpError(400, "A permission group was not found.");
  }
  return { name, email, groupIds };
}
