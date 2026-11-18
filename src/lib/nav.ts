import type { CurrentUser } from "@/lib/auth/session";
import { canEnterRecords, canManageMasterData, canViewAnalytics } from "@/lib/auth/access";

export type NavItem = { href: string; label: string; icon: string };

export function navFor(user: CurrentUser): NavItem[] {
  const items: NavItem[] = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/records", label: "Records", icon: "list" },
  ];
  if (canEnterRecords(user)) {
    items.push(
      { href: "/records/new", label: "New Entry", icon: "plus" },
      { href: "/records/scan", label: "Scan Sheet", icon: "camera" },
      { href: "/records/import", label: "Import Records", icon: "upload" },
    );
  }
  if (canViewAnalytics(user)) items.push({ href: "/analytics", label: "Analytics", icon: "chart" });
  if (canManageMasterData(user)) {
    items.push(
      { href: "/job-cards", label: "Job Cards", icon: "card" },
      { href: "/employees", label: "Employees", icon: "people" },
      { href: "/users", label: "Users", icon: "user" },
      { href: "/imports", label: "Import History", icon: "history" },
      { href: "/settings", label: "Settings", icon: "settings" },
    );
  } else if (canEnterRecords(user)) {
    items.push({ href: "/imports", label: "My Imports", icon: "history" });
  }
  return items;
}

export const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };
