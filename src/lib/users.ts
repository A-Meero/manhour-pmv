import "server-only";

import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/http";

export const ROLES: UserRole[] = ["ADMIN", "MANAGER", "EMPLOYEE"];

export type UserBody = {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  active?: boolean;
  employeeId?: string | null;
  canEnterOwnRecords?: boolean;
};

export async function validateUserBody(body: UserBody, existingId?: string) {
  const name = body.name?.trim();
  const email = body.email?.trim().toLowerCase();
  if (body.name !== undefined && !name) throw new HttpError(400, "Name is required.");
  if (body.email !== undefined && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) throw new HttpError(400, "A valid email is required.");
  if (body.role !== undefined && !ROLES.includes(body.role)) throw new HttpError(400, "Invalid user type.");
  if (body.password !== undefined && body.password !== "" && body.password.length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }
  if (email) {
    const clash = await prisma.user.findFirst({ where: { email, ...(existingId ? { id: { not: existingId } } : {}) } });
    if (clash) throw new HttpError(409, "Another user already uses this email.");
  }
  if (body.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: body.employeeId }, include: { user: true } });
    if (!employee) throw new HttpError(400, "Linked employee not found.");
    if (employee.user && employee.user.id !== existingId) throw new HttpError(409, `Employee is already linked to ${employee.user.email}.`);
  }
  return { name, email };
}

