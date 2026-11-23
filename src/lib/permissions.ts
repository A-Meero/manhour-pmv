/**
 * Everything a non-admin user can be allowed to do. Users get permissions through permission groups
 * (Permissions tab); admins can do everything. Safe to import on the client (labels for the screens).
 */

export const PERMISSIONS = {
  "jobcards.view": { area: "Job cards", label: "View job cards", hint: "Browse job cards, open a card, print its QR" },
  "jobcards.add": { area: "Job cards", label: "Add job cards (photo / PDF, Excel)", hint: "From a photo or PDF of the printed card, or the Excel import" },
  "jobcards.addTyped": { area: "Job cards", label: "Add job cards by typing", hint: "The \"Type it in\" form" },
  "jobcards.workshop": { area: "Job cards", label: "Create workshop repair cards", hint: "Needed with one of the two above" },
  "jobcards.onsite": { area: "Job cards", label: "Create onsite repair cards", hint: "Needed with one of the two above" },
  "jobcards.edit": { area: "Job cards", label: "Edit job card details", hint: "Change the header details and work done lines" },
  "jobcards.close": { area: "Job cards", label: "Close & reopen job cards", hint: "Any job card" },
  "time.scan": { area: "Time", label: "Technician", hint: "Start / stop work on job cards by QR scan (login must be linked to an employee)" },
  "records.own": { area: "Time", label: "Enter own man hours", hint: "Manual, photo sheet or Excel, for themselves only" },
  "records.viewAll": { area: "Records", label: "View all employees' records", hint: "Without this, only their own and their team's" },
  "records.enterAll": { area: "Records", label: "Enter records for anyone", hint: "Without this, only their own (if allowed) and their team's" },
  "records.edit": { area: "Records", label: "Edit records", hint: "Records they can see" },
  "records.delete": { area: "Records", label: "Delete records", hint: "Records they can see" },
  "analytics.view": { area: "Records", label: "View analytics", hint: "" },
  "costs.view": { area: "Records", label: "View costs & rates", hint: "Hourly rates, labour, parts and asset costs" },
  "sessions.reviewAll": { area: "Sessions", label: "Review all work sessions", hint: "Without this, supervisors review their own team only" },
  "inventory.manage": { area: "Store", label: "Store manager", hint: "Issue spare parts to job cards and manage the inventory" },
  "assets.view": { area: "Assets", label: "View assets & history", hint: "" },
  "assets.manage": { area: "Assets", label: "Manage assets", hint: "Add, edit and import assets" },
  "employees.manage": { area: "Administration", label: "Manage employees & shifts", hint: "" },
  "users.manage": { area: "Administration", label: "Manage users", hint: "Create logins and assign groups (can't make admins)" },
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_AREAS = Array.from(new Set(PERMISSION_KEYS.map((key) => PERMISSIONS[key].area)));

export const isPermission = (value: unknown): value is Permission => typeof value === "string" && value in PERMISSIONS;
