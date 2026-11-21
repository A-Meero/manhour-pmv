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

export type NavItem = { href: string; label: string; icon: string };

export function navFor(user: CurrentUser, methods: Record<LoggingMethod, boolean>): NavItem[] {
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
  if (canUseScanPage(user, methods)) items.push({ href: "/scan", label: "Scan Job Card", icon: "scan" });
  if (allowed("qr") && canReviewSessions(user)) items.push({ href: "/sessions", label: "Work Sessions", icon: "clock" });
  if (canViewAnalytics(user)) items.push({ href: "/analytics", label: "Analytics", icon: "chart" });
  if (canAddJobCards(user)) items.push({ href: "/job-cards/new", label: "Add Job Card", icon: "cardplus" });
  if (canBrowseJobCards(user)) items.push({ href: "/job-cards", label: "Job Cards", icon: "card" });
  if (canViewAssets(user) || canManageAssets(user)) items.push({ href: "/assets", label: "Assets", icon: "truck" });
  if (canManageInventory(user)) items.push({ href: "/inventory", label: "Inventory", icon: "box" });
  if (canManageEmployees(user)) items.push({ href: "/employees", label: "Employees", icon: "people" });
  if (canManageUsers(user)) items.push({ href: "/users", label: "Users", icon: "user" });
  if (canManageSettings(user)) items.push({ href: "/permissions", label: "Permissions", icon: "shield" });
  if (canManageSettings(user)) items.push({ href: "/imports", label: "Import History", icon: "history" });
  else if (canEnterRecords(user) || canManageInventory(user) || canAddJobCards(user) || canManageEmployees(user) || canManageAssets(user)) {
    items.push({ href: "/imports", label: "My Imports", icon: "history" });
  }
  if (canManageSettings(user)) items.push({ href: "/settings", label: "Settings", icon: "settings" });
  return items;
}
