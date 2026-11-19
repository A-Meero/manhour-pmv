"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert, Modal, StatusBadge } from "@/components/ui";

type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  canEnterOwnRecords: boolean;
  isStoreManager: boolean;
  employee: { id: string; fileNo: string; name: string } | null;
  supervising: number;
};
type EmployeeOption = { id: string; label: string; linkedUserId: string | null };

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };

export function UsersManager({ users, employees, meId, q }: { users: User[]; employees: EmployeeOption[]; meId: string; q: string }) {
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
              <th>User type</th>
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
                  {ROLE_LABEL[user.role]}
                  {user.role === "EMPLOYEE" && user.canEnterOwnRecords && <div className="text-xs text-gray-500">Can enter own records</div>}
                  {user.isStoreManager && <div className="text-xs font-medium text-blue-700">Store manager</div>}
                </td>
                <td>{user.employee ? `${user.employee.fileNo} – ${user.employee.name}` : <span className="text-gray-400">—</span>}</td>
                <td>{user.supervising ? `${user.supervising} employee(s)` : <span className="text-gray-400">—</span>}</td>
                <td>
                  <StatusBadge active={user.active} />
                </td>
                <td className="text-right">
                  <button className="btn btn-sm" onClick={() => setEditing(user)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Supervisors are assigned on the Employees page.</p>
      {editing && (
        <UserForm
          user={editing === "new" ? null : editing}
          employees={employees}
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
  isMe,
  onClose,
  onSaved,
}: {
  user: User | null;
  employees: EmployeeOption[];
  isMe: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "EMPLOYEE");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(user?.active ?? true);
  const [employeeId, setEmployeeId] = useState(user?.employee?.id ?? "");
  const [canEnterOwnRecords, setCanEnterOwnRecords] = useState(user?.canEnterOwnRecords ?? false);
  const [isStoreManager, setIsStoreManager] = useState(user?.isStoreManager ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = employees.filter((employee) => !employee.linkedUserId || employee.linkedUserId === user?.id);

  async function save() {
    setBusy(true);
    setError("");
    const body = { name, email, role, active, employeeId: employeeId || null, canEnterOwnRecords, isStoreManager, ...(password ? { password } : {}) };
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">User type *</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isMe}>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
          </div>
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
        {role === "EMPLOYEE" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={canEnterOwnRecords} onChange={(e) => setCanEnterOwnRecords(e.target.checked)} />
            Can enter his own records {!employeeId && <span className="text-xs text-amber-700">(needs a linked employee)</span>}
          </label>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={isStoreManager} onChange={(e) => setIsStoreManager(e.target.checked)} />
          <span>
            Store manager
            <span className="block text-xs text-gray-500">Manages the inventory and issues spare parts to job cards.</span>
          </span>
        </label>
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
