import type { CurrentUser } from "@/lib/auth/session";
import {
  canAddJobCards,
  canBrowseJobCards,
  canEnterRecords,
  canManageEmployees,
  canManageInventory,
  canManageAssets,
  canManageSettings,
  canManageUsers,
  canReviewSessions,
  canViewAnalytics,
  canViewAssets,
  methodAllowed,
  canUseScanPage,
} from "@/lib/auth/access";
import type { LoggingMethod } from "@/lib/logging-methods";
import { canViewReports } from "@/lib/reports-access";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

/** Things the layout counts for the menu: open part requests (store), job cards received by the user or their team. */
export type NavCounts = { openPartRequests: number; receivedCards: number };

export function navFor(user: CurrentUser, methods: Record<LoggingMethod, boolean>, counts: NavCounts = { openPartRequests: 0, receivedCards: 0 }): NavItem[] {
  const items: NavItem[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/records", label: "Records", icon: "list" },
  ];
  const allowed = (method: LoggingMethod) => methodAllowed(user, methods, method);
  if (canEnterRecords(user)) {
    if (allowed("manual")) items.push({ href: "/records/new", label: "New Entry", icon: "plus" });
    if (allowed("photo")) items.push({ href: "/records/scan", label: "Scan Sheet", icon: "camera" });
    if (allowed("excel")) items.push({ href: "/records/import", label: "Import Records", icon: "upload" });
  }
  if (user.employeeId && allowed("qr") && (user.isAdmin || user.permissions.has("time.scan"))) {
    items.push({ href: "/my-work", label: "My Work", icon: "timer" });
  }
  if (counts.receivedCards > 0) items.push({ href: "/my-job-cards", label: "My Job Cards", icon: "mycards" });
  if (canUseScanPage(user, methods)) items.push({ href: "/scan", label: "Scan QR", icon: "scan" });
  if (allowed("qr") && canReviewSessions(user)) items.push({ href: "/sessions", label: "Work Sessions", icon: "clock" });
  if (canViewAnalytics(user)) items.push({ href: "/analytics", label: "Analytics", icon: "chart" });
  if (canViewReports(user)) items.push({ href: "/reports", label: "Reports", icon: "report" });
  if (canAddJobCards(user)) items.push({ href: "/job-cards/new", label: "Add Job Card", icon: "cardplus" });
  if (canBrowseJobCards(user)) items.push({ href: "/job-cards", label: "Job Cards", icon: "card" });
  if (canViewAssets(user) || canManageAssets(user)) items.push({ href: "/assets", label: "Assets", icon: "truck" });
  if (canManageInventory(user)) {
    items.push({ href: "/part-requests", label: "Part Requests", icon: "clipboard", badge: counts.openPartRequests || undefined });
    items.push({ href: "/inventory", label: "Inventory", icon: "box" });
  }
  if (canManageEmployees(user)) items.push({ href: "/employees", label: "Employees", icon: "people" });
  if (canManageUsers(user)) items.push({ href: "/users", label: "Users", icon: "user" });
  if (canManageSettings(user)) items.push({ href: "/permissions", label: "Permissions", icon: "shield" });
  if (canManageSettings(user)) items.push({ href: "/imports", label: "Import History", icon: "history" });
  else if (canEnterRecords(user) || canManageInventory(user) || canAddJobCards(user) || canManageEmployees(user) || canManageAssets(user)) {
    items.push({ href: "/imports", label: "My Imports", icon: "history" });
  }
  if (canManageSettings(user)) items.push({ href: "/audit", label: "Audit Log", icon: "audit" });
  if (canManageSettings(user)) items.push({ href: "/settings", label: "Settings", icon: "settings" });
  return items;
}
