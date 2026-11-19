"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChartColumn,
  Camera,
  Clock,
  CreditCard,
  History,
  House,
  KeyRound,
  List,
  LogOut,
  Menu,
  Package,
  Plus,
  Settings,
  Timer,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { api } from "@/lib/client";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: House,
  list: List,
  plus: Plus,
  camera: Camera,
  upload: Upload,
  chart: ChartColumn,
  card: CreditCard,
  people: Users,
  user: User,
  history: History,
  settings: Settings,
  timer: Timer,
  clock: Clock,
  box: Package,
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/records") return pathname === "/records";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  nav,
  user,
  children,
}: {
  nav: NavItem[];
  user: { name: string; role: string; supervisor: boolean };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-4">
        <Image src="/ahmadiah-logo.png" alt="Ahmadiah" width={1218} height={204} className="h-auto w-full" priority />
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-brand">Man Hour System</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? List;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                active ? "bg-brand-soft text-brand" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-200 px-4 py-3 text-sm">
        <p className="truncate font-semibold text-gray-900">{user.name}</p>
        <p className="text-xs text-gray-500">
          {user.role}
          {user.supervisor ? " · Supervisor" : ""}
        </p>
        <div className="mt-2 flex gap-2">
          <Link href="/account" onClick={() => setOpen(false)} className="btn btn-sm">
            <KeyRound className="h-3.5 w-3.5" /> Password
          </Link>
          <button onClick={logout} className="btn btn-sm">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-xl">
            <button className="absolute right-2 top-2 rounded p-2 text-gray-500" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded p-1 text-gray-700" aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
          <Image src="/ahmadiah-a.png" alt="" width={214} height={204} className="h-7 w-auto" />
          <span className="text-sm font-bold text-gray-900">Man Hour System</span>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
