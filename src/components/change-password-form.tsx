"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";

export function ChangePasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ kind: "error", text: "The new passwords do not match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/auth/password", { body: { currentPassword, newPassword } });
      setMessage({ kind: "success", text: "Password changed." });
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-md space-y-3 p-5">
      <div>
        <label className="label">Current password</label>
        <input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div>
        <label className="label">New password</label>
        <input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} required minLength={8} />
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <button className="btn btn-primary" disabled={busy}>Change password</button>
    </form>
  );
}
