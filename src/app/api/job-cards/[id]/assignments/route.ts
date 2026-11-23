import { NextResponse } from "next/server";
import { readJson, withUser } from "@/lib/http";
import { setAssignments } from "@/lib/assignments";

type Ctx = { params: Promise<{ id: string }> };

/** Received-by team leader (or admin): { employeeIds: [...] } = the team members this job card is assigned to. */
export const PUT = withUser<Ctx>(async (request, user, { params }) => {
  const { id } = await params;
  const body = await readJson<{ employeeIds?: unknown }>(request);
  return NextResponse.json(await setAssignments(user, id, body.employeeIds));
});
