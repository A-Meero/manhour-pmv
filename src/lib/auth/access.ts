import type { CurrentUser } from "@/lib/auth/session";
import type { LoggingMethod } from "@/lib/logging-methods";
import type { Permission } from "@/lib/permissions";

/** "ALL" = no restriction, otherwise the list of employee ids the user may act on. */
export type EmployeeScope = "ALL" | string[];

/** Admins have every permission (see getCurrentUser), so `can` is true for them too. */
export const can = (user: CurrentUser, permission: Permission) => user.isAdmin || user.permissions.has(permission);

export const isAdmin = (user: CurrentUser) => user.isAdmin;
/** Supervising is an assignment (Employees › supervisors), not a permission: it covers the user's own team. */
export const isSupervisor = (user: CurrentUser) => user.supervisedEmployeeIds.length > 0;

/** Settings, API keys, form fields, photo-reading providers, the Permissions tab: admins only. */
export const canManageSettings = isAdmin;
export const canManageEmployees = (user: CurrentUser) => can(user, "employees.manage");
export const canManageUsers = (user: CurrentUser) => can(user, "users.manage");
export const canAddJobCards = (user: CurrentUser) => can(user, "jobcards.add");
export const canEditJobCards = (user: CurrentUser) => can(user, "jobcards.edit");
export const canViewAnalytics = (user: CurrentUser) => can(user, "analytics.view");
export const canEditRecords = (user: CurrentUser) => can(user, "records.edit");
export const canDeleteRecords = (user: CurrentUser) => can(user, "records.delete");
/** Labour rates, labour cost, parts cost and asset values */
export const canViewCosts = (user: CurrentUser) => can(user, "costs.view");
export const canManageInventory = (user: CurrentUser) => can(user, "inventory.manage");
export const canViewAssets = (user: CurrentUser) => can(user, "assets.view") || can(user, "assets.manage");
export const canManageAssets = (user: CurrentUser) => can(user, "assets.manage");
/** Sees every employee's records (otherwise own + team) */
export const seesAllRecords = (user: CurrentUser) => can(user, "records.viewAll");
/** Reviews every employee's QR sessions (otherwise supervisors: their team) */
export const reviewsAllSessions = (user: CurrentUser) => can(user, "sessions.reviewAll");

/** "Close job cards" closes any card; supervisors without it close only cards their team worked on (src/lib/job-cards.ts). */
export const mayCloseJobCards = (user: CurrentUser) => can(user, "jobcards.close") || isSupervisor(user);
/** Fix / review QR work sessions (supervisors: only their employees' sessions) */
export const canReviewSessions = (user: CurrentUser) => reviewsAllSessions(user) || isSupervisor(user);
/** Read-only list of job cards (to find a card, print its QR, see its details) */
export const canBrowseJobCards = (user: CurrentUser) =>
  can(user, "jobcards.view") ||
  canAddJobCards(user) ||
  canEditJobCards(user) ||
  can(user, "jobcards.close") ||
  isSupervisor(user) ||
  canManageInventory(user);

/** A logging way switched off in Settings stays available to admins only. */
export function methodAllowed(user: CurrentUser, methods: Record<LoggingMethod, boolean>, method: LoggingMethod) {
  return isAdmin(user) || methods[method];
}

/** Technicians record time by QR scan with their own login, which must be linked to an employee. */
export function canScanTime(user: CurrentUser, methods: Record<LoggingMethod, boolean>) {
  return !!user.employeeId && can(user, "time.scan") && methodAllowed(user, methods, "qr");
}

/** People who see others' records can search by person; everyone else only sees their own. */
export const canSearchPeople = (user: CurrentUser) => seesAllRecords(user) || isSupervisor(user);

/** The in-portal scanner: technicians (when QR is on), store managers, and people who work with job cards. */
export function canUseScanPage(user: CurrentUser, methods: Record<LoggingMethod, boolean>) {
  return canScanTime(user, methods) || canManageInventory(user) || mayCloseJobCards(user) || can(user, "jobcards.view");
}

/** May enter man hours for themselves */
export const canEnterOwn = (user: CurrentUser) => can(user, "records.own") && !!user.employeeId;

/** "Enter records for anyone" → everyone; otherwise their team, plus themselves with "Enter own man hours". */
export function getEntryScope(user: CurrentUser): EmployeeScope {
  if (can(user, "records.enterAll")) return "ALL";
  const ids = new Set(user.supervisedEmployeeIds);
  if (canEnterOwn(user) && user.employeeId) ids.add(user.employeeId);
  return Array.from(ids);
}

/** "View all employees' records" → everything; otherwise their team and themselves. */
export function getViewScope(user: CurrentUser): EmployeeScope {
  if (seesAllRecords(user)) return "ALL";
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

/** Short description of the user for the header ("Admin", group names, "Supervisor"). */
export function userBadge(user: CurrentUser) {
  if (user.isAdmin) return "Admin";
  if (user.groupNames.length) return user.groupNames.join(", ");
  return isSupervisor(user) ? "Supervisor" : "Employee";
}
