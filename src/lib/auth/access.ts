import type { CurrentUser } from "@/lib/auth/session";

/** "ALL" = no restriction, otherwise the list of employee ids the user may act on. */
export type EmployeeScope = "ALL" | string[];

export const isAdmin = (user: CurrentUser) => user.role === "ADMIN";
export const isManagerOrAdmin = (user: CurrentUser) => user.role === "ADMIN" || user.role === "MANAGER";
export const isSupervisor = (user: CurrentUser) => user.supervisedEmployeeIds.length > 0;

export const canManageMasterData = isAdmin;
export const canViewAnalytics = isManagerOrAdmin;
export const canEditRecords = isManagerOrAdmin;
export const canDeleteRecords = isAdmin;

function canEnterOwn(user: CurrentUser) {
  return user.role === "EMPLOYEE" && user.canEnterOwnRecords && !!user.employeeId;
}

/** Admins and managers enter for anyone; supervisors for their employees; flagged employees for themselves. */
export function getEntryScope(user: CurrentUser): EmployeeScope {
  if (isManagerOrAdmin(user)) return "ALL";
  const ids = new Set(user.supervisedEmployeeIds);
  if (canEnterOwn(user) && user.employeeId) ids.add(user.employeeId);
  return Array.from(ids);
}

/** Admins and managers see everything; others see their supervised employees and themselves. */
export function getViewScope(user: CurrentUser): EmployeeScope {
  if (isManagerOrAdmin(user)) return "ALL";
  const ids = new Set(user.supervisedEmployeeIds);
  if (user.employeeId) ids.add(user.employeeId);
  return Array.from(ids);
}

export function canEnterRecords(user: CurrentUser) {
  const scope = getEntryScope(user);
  return scope === "ALL" || scope.length > 0;
}

export function scopeAllows(scope: EmployeeScope, employeeId: string) {
  return scope === "ALL" || scope.includes(employeeId);
}

/** Prisma `where` fragment restricting man-hour records to a scope. */
export function scopeWhere(scope: EmployeeScope): { employeeId?: { in: string[] } } {
  return scope === "ALL" ? {} : { employeeId: { in: scope } };
}

/** Prisma `where` fragment restricting employees to a scope. */
export function employeeScopeWhere(scope: EmployeeScope): { id?: { in: string[] } } {
  return scope === "ALL" ? {} : { id: { in: scope } };
}
