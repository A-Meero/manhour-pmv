"use client";

import { useState } from "react";

export type PickUser = { id: string; name: string; email: string; role: string };

/** Checkbox list with a search box for choosing one or more users. */
export function SupervisorPicker({ users, value, onChange }: { users: PickUser[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const visible = users.filter((user) => !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query));
  const selected = users.filter((user) => value.includes(user.id));
  return (
    <div className="rounded-md border border-gray-300">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2">
          {selected.map((user) => (
            <button
              type="button"
              key={user.id}
              className="badge bg-brand-soft text-brand"
              onClick={() => onChange(value.filter((id) => id !== user.id))}
              title="Remove"
            >
              {user.name} ×
            </button>
          ))}
        </div>
      )}
      <input className="w-full border-b border-gray-200 px-3 py-2 text-sm outline-none" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-44 overflow-y-auto p-1">
        {visible.length === 0 && <p className="px-2 py-2 text-sm text-gray-500">No users found.</p>}
        {visible.map((user) => (
          <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
            <input
              type="checkbox"
              checked={value.includes(user.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, user.id] : value.filter((id) => id !== user.id))}
            />
            <span className="flex-1">{user.name}</span>
            <span className="text-xs text-gray-500">{user.role}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
