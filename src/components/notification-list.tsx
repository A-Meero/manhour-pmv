"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { formatWhen, type ClientNotification } from "@/components/notification-bell";

export function NotificationList({ items: initial }: { items: ClientNotification[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const unread = items.filter((n) => !n.read).length;

  async function open(item: ClientNotification) {
    if (!item.read) {
      setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      await api(`/api/notifications/${item.id}`, { method: "POST" }).catch(() => undefined);
    }
    if (item.link) router.push(item.link);
  }

  async function readAll() {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    await api("/api/notifications/read-all", { method: "POST" }).catch(() => undefined);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {unread > 0 && (
        <button className="btn btn-sm" onClick={readAll}>
          Mark all {unread} as read
        </button>
      )}
      <div className="card divide-y divide-gray-100">
        {items.length === 0 && <p className="p-6 text-center text-sm text-gray-500">No notifications yet.</p>}
        {items.map((item) => (
          <button key={item.id} onClick={() => open(item)} className={`block w-full px-4 py-3 text-left hover:bg-gray-50 ${item.read ? "" : "bg-blue-50/60"}`}>
            <span className="flex items-start gap-2">
              {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.title}</span>
                {item.body && <span className="block text-sm text-gray-600">{item.body}</span>}
              </span>
              <span className="shrink-0 text-xs text-gray-400">{formatWhen(item.createdAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
