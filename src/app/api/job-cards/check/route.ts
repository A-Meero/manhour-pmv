import { NextResponse } from "next/server";
import { canAddJobCards, canEditJobCards } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { checkCard } from "@/lib/job-card-entry";

/** Live checks for the job card form: is the number taken, which asset matches, does it have an open card. */
export const POST = withUser(async (request) => {
  const body = await readJson<{ code?: unknown; assetId?: unknown; assetCode?: unknown; plateNo?: unknown; chassisNo?: unknown; exceptId?: unknown }>(request);
  const result = await checkCard({ ...body, exceptId: typeof body.exceptId === "string" ? body.exceptId : undefined });
  return NextResponse.json(result);
}, (user) => canAddJobCards(user) || canEditJobCards(user));
