import "server-only";

import { prisma } from "@/lib/prisma";
import { TEAM_LEADER_WHERE } from "@/lib/employee-match";
import type { CurrentUser } from "@/lib/auth/session";
import { allowedRepairTypes } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import type { RepairTypeValue } from "@/lib/repair-type";

export type JobCardFormOptions = {
  /** Team leaders for "Received by" ({ value: id, label: "fileNo – name" }) */
  employees: { value: string; label: string }[];
  /** Types this user may give a card */
  allowedTypes: RepairTypeValue[];
  /** Settings › Workshop words, to suggest the type from "Repair at" */
  workshopWords: string[];
};

export async function jobCardFormOptions(user: CurrentUser): Promise<JobCardFormOptions> {
  const [employees, settings] = await Promise.all([
    prisma.employee.findMany({ where: TEAM_LEADER_WHERE, select: { id: true, fileNo: true, name: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  return {
    employees: employees.map((e) => ({ value: e.id, label: `${e.fileNo} – ${e.name}` })),
    allowedTypes: allowedRepairTypes(user),
    workshopWords: settings.workshopWords,
  };
}
