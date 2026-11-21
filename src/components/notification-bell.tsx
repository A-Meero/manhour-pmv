"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { api } from "@/lib/client";

export type ClientNotification = { id: string; kind: string; title: string; body: string; link: string; read: boolean; createdAt: string };

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Kuwait", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Bell with unread count. Refreshes every minute and when the window gets focus. */
export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ unread: number; items: ClientNotification[] }>("/api/notifications");
      setUnread(data.unread);
      setItems(data.items);
    } catch {
      // signed out or offline: try again on the next tick
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function openItem(item: ClientNotification) {
    setOpen(false);
    if (!item.read) {
      setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      setUnread((n) => Math.max(0, n - 1));
      await api(`/api/notifications/${item.id}`, { method: "POST" }).catch(() => undefined);
    }
    if (item.link) router.push(item.link);
  }

  async function readAll() {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await api("/api/notifications/read-all", { method: "POST" }).catch(() => undefined);
  }

  return (
    <div className="relative" ref={box}>
      <button
        className="relative rounded-full p-2 text-gray-700 hover:bg-gray-100"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => {
          if (!open) void load();
          setOpen((v) => !v);
        }}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button className="text-xs text-brand hover:underline" onClick={readAll}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-gray-500">No notifications yet.</p>}
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => openItem(item)}
                className={`block w-full border-b border-gray-50 px-3 py-2 text-left hover:bg-gray-50 ${item.read ? "" : "bg-blue-50/60"}`}
              >
                <span className="flex items-start gap-2">
                  {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">{item.title}</span>
                    {item.body && <span className="block text-xs text-gray-600">{item.body}</span>}
                    <span className="block text-[11px] text-gray-400">{formatWhen(item.createdAt)}</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-gray-100 px-3 py-2 text-center text-xs text-brand hover:bg-gray-50">
            See all
          </Link>
        </div>
      )}
    </div>
  );
}
