import type { CurrentUser } from "@/lib/auth/session";
import {
  canBrowseJobCards,
  canEnterRecords,
  canManageInventory,
  canManageMasterData,
  canReviewSessions,
  canViewAnalytics,
  methodAllowed,
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
  if (user.employeeId && allowed("qr")) items.push({ href: "/my-work", label: "My Work", icon: "timer" });
  if (allowed("qr") && canReviewSessions(user)) items.push({ href: "/sessions", label: "Work Sessions", icon: "clock" });
  if (canViewAnalytics(user)) items.push({ href: "/analytics", label: "Analytics", icon: "chart" });
  if (canBrowseJobCards(user)) items.push({ href: "/job-cards", label: "Job Cards", icon: "card" });
  if (canManageInventory(user)) items.push({ href: "/inventory", label: "Inventory", icon: "box" });
  if (canManageMasterData(user)) {
    items.push(
      { href: "/employees", label: "Employees", icon: "people" },
      { href: "/users", label: "Users", icon: "user" },
      { href: "/imports", label: "Import History", icon: "history" },
      { href: "/settings", label: "Settings", icon: "settings" },
    );
  } else if (canEnterRecords(user) || canManageInventory(user)) {
    items.push({ href: "/imports", label: "My Imports", icon: "history" });
  }
  return items;
}

export const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };
