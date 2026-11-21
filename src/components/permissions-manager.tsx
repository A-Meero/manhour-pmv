"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Users } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { PERMISSION_AREAS, PERMISSION_KEYS, PERMISSIONS, type Permission } from "@/lib/permissions";
import { Alert, Modal } from "@/components/ui";

type Group = { id: string; name: string; description: string; permissions: string[]; memberIds: string[] };
type UserRow = { id: string; name: string; email: string; isAdmin: boolean; active: boolean };

export function PermissionsManager({ groups, users }: { groups: Group[]; users: UserRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(groups[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const selected = groups.find((g) => g.id === selectedId) ?? groups[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="card h-fit p-2">
        <div className="space-y-1">
          {groups.length === 0 && <p className="px-2 py-3 text-sm text-gray-500">No groups yet.</p>}
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setSelectedId(group.id)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                selected?.id === group.id ? "bg-brand-soft font-semibold text-brand" : "hover:bg-gray-100"
              }`}
            >
              <span className="truncate">{group.name}</span>
              <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-gray-500">
                <Users className="h-3 w-3" /> {group.memberIds.length}
              </span>
            </button>
          ))}
        </div>
        <button className="btn mt-2 w-full" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New group
        </button>
      </div>

      {selected ? (
        <GroupEditor
          key={selected.id + selected.permissions.join() + selected.memberIds.join()}
          group={selected}
          users={users}
          onChanged={() => router.refresh()}
          onDeleted={() => {
            setSelectedId("");
            router.refresh();
          }}
        />
      ) : (
        <div className="card p-6 text-sm text-gray-500">Create a group to start giving permissions.</div>
      )}

      {creating && (
        <NewGroup
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setSelectedId(id);
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function GroupEditor({ group, users, onChanged, onDeleted }: { group: Group; users: UserRow[]; onChanged: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [permissions, setPermissions] = useState<string[]>(group.permissions);
  const [members, setMembers] = useState<string[]>(group.memberIds);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const dirty =
    name !== group.name ||
    description !== group.description ||
    permissions.slice().sort().join() !== group.permissions.slice().sort().join() ||
    members.slice().sort().join() !== group.memberIds.slice().sort().join();

  const visibleUsers = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users.filter((u) => !u.isAdmin && (!term || u.name.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)));
  }, [users, q]);

  const toggle = (key: Permission, on: boolean) => setPermissions((list) => (on ? [...list, key] : list.filter((p) => p !== key)));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/permission-groups/${group.id}`, { method: "PATCH", body: { name, description, permissions } });
      await api(`/api/permission-groups/${group.id}/members`, { method: "PUT", body: { userIds: members } });
      setMessage({ kind: "success", text: "Saved. Changes apply on the users' next page load." });
      onChanged();
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete the group "${group.name}"? Its ${group.memberIds.length} member(s) lose the permissions it gives.`)) return;
    setBusy(true);
    try {
      await api(`/api/permission-groups/${group.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="group-name">Group name</label>
            <input id="group-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="group-desc">Description</label>
            <input id="group-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-semibold">Permissions</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {PERMISSION_AREAS.map((area) => (
            <div key={area}>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">{area}</h3>
              <div className="space-y-1.5">
                {PERMISSION_KEYS.filter((key) => PERMISSIONS[key].area === area).map((key) => (
                  <label key={key} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={permissions.includes(key)} onChange={(e) => toggle(key, e.target.checked)} />
                    <span>
                      {PERMISSIONS[key].label}
                      {PERMISSIONS[key].hint && <span className="block text-xs text-gray-500">{PERMISSIONS[key].hint}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Members ({members.length})</h2>
          <input className="input max-w-xs" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2">
          {visibleUsers.map((user) => (
            <label key={user.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                checked={members.includes(user.id)}
                onChange={(e) => setMembers((list) => (e.target.checked ? [...list, user.id] : list.filter((id) => id !== user.id)))}
              />
              <span className={`flex-1 truncate ${user.active ? "" : "text-gray-400 line-through"}`}>{user.name}</span>
              <span className="truncate text-xs text-gray-500">{user.email}</span>
            </label>
          ))}
          {visibleUsers.length === 0 && <p className="px-2 py-2 text-sm text-gray-500">No users found.</p>}
        </div>
        <p className="mt-2 text-xs text-gray-500">Admins are not listed: they already have every permission.</p>
      </div>

      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <div className="flex flex-wrap justify-between gap-2">
        <button className="btn text-red-700" onClick={remove} disabled={busy}>
          <Trash2 className="h-4 w-4" /> Delete group
        </button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function NewGroup({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const { id } = await api<{ id: string }>("/api/permission-groups", { body: { name, permissions: [] } });
      onCreated(id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Modal title="New permission group" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="new-group">Name</label>
          <input id="new-group" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Planner" autoFocus />
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={busy || !name.trim()}>Create</button>
        </div>
      </div>
    </Modal>
  );
}
