"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal, StatusBadge } from "@/components/ui";

type User = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  active: boolean;
  groupIds: string[];
  employee: { id: string; fileNo: string; name: string } | null;
  supervising: number;
};
type EmployeeOption = { id: string; label: string; linkedUserId: string | null };
type Group = { id: string; name: string; description: string };

export function UsersManager({
  users,
  employees,
  groups,
  meId,
  meIsAdmin,
  q,
}: {
  users: User[];
  employees: EmployeeOption[];
  groups: Group[];
  meId: string;
  meIsAdmin: boolean;
  q: string;
}) {
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const router = useRouter();
  const [editing, setEditing] = useState<User | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <form className="flex flex-1 gap-2" action="/users">
          <input name="q" defaultValue={q} placeholder="Search name or email" className="input sm:max-w-xs" />
          <button className="btn">Search</button>
        </form>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add user
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Access</th>
              <th>Linked employee</th>
              <th>Supervises</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="font-medium">{user.name}</td>
                <td>{user.email}</td>
                <td>
                  {user.isAdmin ? (
                    <span className="font-medium text-blue-700">Admin</span>
                  ) : user.groupIds.length ? (
                    <div className="flex flex-wrap gap-1">
                      {user.groupIds.map((id) => (
                        <span key={id} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{groupName.get(id) ?? "?"}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">No groups (own records only)</span>
                  )}
                </td>
                <td>{user.employee ? `${user.employee.fileNo} – ${user.employee.name}` : <span className="text-gray-400">—</span>}</td>
                <td>{user.supervising ? `${user.supervising} employee(s)` : <span className="text-gray-400">—</span>}</td>
                <td>
                  <StatusBadge active={user.active} />
                </td>
                <td className="text-right">
                  <button className="btn btn-sm" onClick={() => setEditing(user)} disabled={user.isAdmin && !meIsAdmin} title={user.isAdmin && !meIsAdmin ? "Only admins can change an admin" : undefined}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Supervisors are assigned on the Employees page. What each group allows is set on the Permissions page.</p>
      {editing && (
        <UserForm
          user={editing === "new" ? null : editing}
          employees={employees}
          groups={groups}
          meIsAdmin={meIsAdmin}
          isMe={editing !== "new" && editing.id === meId}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function UserForm({
  user,
  employees,
  groups,
  meIsAdmin,
  isMe,
  onClose,
  onSaved,
}: {
  user: User | null;
  employees: EmployeeOption[];
  groups: Group[];
  meIsAdmin: boolean;
  isMe: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [isAdmin, setIsAdmin] = useState(user?.isAdmin ?? false);
  const [groupIds, setGroupIds] = useState<string[]>(user?.groupIds ?? []);
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(user?.active ?? true);
  const [employeeId, setEmployeeId] = useState(user?.employee?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = employees.filter((employee) => !employee.linkedUserId || employee.linkedUserId === user?.id);

  async function save() {
    setBusy(true);
    setError("");
    const body = { name, email, active, employeeId: employeeId || null, groupIds, ...(meIsAdmin ? { isAdmin } : {}), ...(password ? { password } : {}) };
    try {
      if (user) await api(`/api/users/${user.id}`, { method: "PATCH", body });
      else await api("/api/users", { body });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={user ? `Edit ${user.name}` : "Add user"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Name *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Email (login) *</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div>
            <label className="label">{user ? "New password" : "Password *"}</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              placeholder={user ? "Leave empty to keep" : "At least 8 characters"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Linked employee record</label>
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— None —</option>
            {options.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">The user sees this employee&apos;s records as their own, and can record time on job cards by scanning their QR codes.</p>
        </div>
        {meIsAdmin && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} disabled={isMe} />
            <span>
              Admin
              <span className="block text-xs text-gray-500">Full access to everything, including Settings and Permissions.</span>
            </span>
          </label>
        )}
        {!isAdmin && (
          <div>
            <span className="label">Permission groups</span>
            {groups.length === 0 && <p className="text-xs text-gray-500">No groups yet. Create them on the Permissions page.</p>}
            <div className="space-y-1.5">
              {groups.map((group) => (
                <label key={group.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={groupIds.includes(group.id)}
                    onChange={(e) => setGroupIds((ids) => (e.target.checked ? [...ids, group.id] : ids.filter((id) => id !== group.id)))}
                  />
                  <span>
                    {group.name}
                    {group.description && <span className="block text-xs text-gray-500">{group.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={isMe} />
          Active (can sign in)
        </label>
        {error && <Alert>{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </Modal>
  );
}
