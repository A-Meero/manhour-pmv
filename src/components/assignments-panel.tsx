"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCheck } from "lucide-react";
import { api, errorMessage } from "@/lib/client";
import { Alert } from "@/components/ui";

type Member = { id: string; label: string };

/**
 * "Assigned to" on a job card. The received-by team leader (and admins) tick team members; the card then shows
 * on those members' Home and My Job Cards, and they get a notification. Everyone else just sees the names.
 */
export function AssignmentsPanel({
  jobCardId,
  assigned,
  team,
  canAssign,
  leaderName,
}: {
  jobCardId: string;
  assigned: Member[];
  team: Member[];
  canAssign: boolean;
  leaderName: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<string[]>(assigned.map((m) => m.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Members assigned earlier who have since left the team stay listed so they can be removed.
  const choices = [...team, ...assigned.filter((m) => !team.some((t) => t.id === m.id))];

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/job-cards/${jobCardId}/assignments`, { method: "PUT", body: { employeeIds: chosen } });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <UserCheck className="h-4 w-4" /> Assigned to
        </h2>
        {canAssign && !editing && leaderName && (
          <button
            className="btn btn-sm"
            onClick={() => {
              setChosen(assigned.map((m) => m.id));
              setEditing(true);
            }}
          >
            Assign team members
          </button>
        )}
      </div>
      {!leaderName && <p className="text-sm text-gray-500">Choose the received-by team leader (Edit details) to assign this card to his team.</p>}
      {!editing &&
        leaderName &&
        (assigned.length ? (
          <p className="text-sm">{assigned.map((m) => m.label).join(", ")}</p>
        ) : (
          <p className="text-sm text-gray-500">Not assigned yet{canAssign ? "." : `. ${leaderName} can assign it to his team.`}</p>
        ))}
      {editing && (
        <div className="space-y-2">
          {choices.length === 0 && <p className="text-sm text-gray-500">{leaderName} has no team members yet (Employees › Supervisors).</p>}
          <div className="grid gap-1 sm:grid-cols-2">
            {choices.map((member) => (
              <label key={member.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={chosen.includes(member.id)}
                  onChange={(e) => setChosen((list) => (e.target.checked ? [...list, member.id] : list.filter((id) => id !== member.id)))}
                />
                {member.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button className="btn btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
          <p className="text-xs text-gray-500">Newly assigned members get a notification. Anyone can still record time on the card as usual.</p>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
