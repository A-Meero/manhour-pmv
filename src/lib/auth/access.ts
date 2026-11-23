import type { CurrentUser } from "@/lib/auth/session";
import type { LoggingMethod } from "@/lib/logging-methods";
import type { Permission } from "@/lib/permissions";
import { REPAIR_TYPES, type RepairTypeValue } from "@/lib/repair-type";

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
/** Job card types this user may create (workshop / onsite repairs) */
export function allowedRepairTypes(user: CurrentUser): RepairTypeValue[] {
  return REPAIR_TYPES.filter((type) => can(user, type === "WORKSHOP" ? "jobcards.workshop" : "jobcards.onsite"));
}
export const canCreateRepairType = (user: CurrentUser, type: RepairTypeValue) => allowedRepairTypes(user).includes(type);
/** From a photo / PDF of the printed card, or the Excel import */
export const canAddByPhoto = (user: CurrentUser) => can(user, "jobcards.add") && allowedRepairTypes(user).length > 0;
/** The "Type it in" form */
export const canAddTyped = (user: CurrentUser) => can(user, "jobcards.addTyped") && allowedRepairTypes(user).length > 0;
/** Any way of adding job cards */
export const canAddJobCards = (user: CurrentUser) => canAddByPhoto(user) || canAddTyped(user);
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
/** The received-by employee's own login, or one of that employee's supervisors */
export function isReceiverOrSupervisor(user: CurrentUser, receivedById: string | null | undefined) {
  if (!receivedById) return false;
  return user.employeeId === receivedById || user.supervisedEmployeeIds.includes(receivedById);
}
/** Part requests on a job card: the received-by employee's user, their supervisors, admins */
export const canRequestParts = (user: CurrentUser, card: { receivedById: string | null }) =>
  user.isAdmin || isReceiverOrSupervisor(user, card.receivedById);
/** Open one job card's page: anyone who can browse job cards, its received-by leader (and supervisors), and its assigned members */
export const canViewJobCard = (user: CurrentUser, card: { receivedById: string | null; assignedEmployeeIds?: string[] }) =>
  canBrowseJobCards(user) ||
  isReceiverOrSupervisor(user, card.receivedById) ||
  (!!user.employeeId && !!card.assignedEmployeeIds?.includes(user.employeeId));
/** Assign a job card to team members: its received-by team leader, and admins */
export const canAssignJobCard = (user: CurrentUser, card: { receivedById: string | null }) =>
  user.isAdmin || (!!card.receivedById && user.employeeId === card.receivedById);
/** Upload / replace a job card's document: anyone who adds or edits job cards, and admins */
export const canUploadDocument = (user: CurrentUser) => canAddJobCards(user) || canEditJobCards(user);
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

/** What the in-portal scanner opens for this user: job cards, assets, inventory items. */
export function scanKinds(user: CurrentUser, methods: Record<LoggingMethod, boolean>) {
  const kinds: ("jobcard" | "asset" | "part")[] = [];
  if (canUseJobCardScan(user, methods)) kinds.push("jobcard");
  if (canViewAssets(user)) kinds.push("asset");
  if (canManageInventory(user)) kinds.push("part");
  return kinds;
}

/** The in-portal scanner: anyone it can open something for. */
export function canUseScanPage(user: CurrentUser, methods: Record<LoggingMethod, boolean>) {
  return scanKinds(user, methods).length > 0;
}

/** Scanning job card QRs: technicians (when QR is on), store managers, and people who work with job cards. */
function canUseJobCardScan(user: CurrentUser, methods: Record<LoggingMethod, boolean>) {
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
