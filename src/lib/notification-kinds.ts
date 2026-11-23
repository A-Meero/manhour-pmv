/** Notification kinds with labels for the Account page (which ones come as push). Safe to import on the client. */
export const NOTIFICATION_KINDS = [
  { kind: "SHIFT_REMINDER", label: "Still clocked in after my shift" },
  { kind: "LIMIT_STOP", label: "My work was stopped at the hour limit" },
  { kind: "JOB_CARD_RECEIVED", label: "A job card was received by me" },
  { kind: "JOB_CARD_ASSIGNED", label: "A job card was assigned to me" },
  { kind: "PART_REQUEST_UPDATE", label: "Updates on my part requests (MR raised, fulfilled)" },
  { kind: "PART_REQUEST", label: "New part requests (store)" },
  { kind: "LOW_STOCK", label: "Low stock (store)" },
  { kind: "SESSION_REVIEW", label: "Work sessions to review (supervisors)" },
] as const;

export const MUTABLE_KINDS: string[] = NOTIFICATION_KINDS.map((k) => k.kind);
