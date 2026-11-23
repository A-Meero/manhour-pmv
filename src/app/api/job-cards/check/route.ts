import { NextResponse } from "next/server";
import { canAddJobCards, canEditJobCards } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { checkCard } from "@/lib/job-card-entry";
import { matchReceivedBy } from "@/lib/employee-match";

/**
 * Live checks for the job card form: is the number taken, which asset matches, does it have an open card,
 * and which employee the printed "Received by" name matches.
 */
export const POST = withUser(async (request) => {
  const body = await readJson<{
    code?: unknown;
    assetId?: unknown;
    assetCode?: unknown;
    plateNo?: unknown;
    chassisNo?: unknown;
    exceptId?: unknown;
    receivedBy?: unknown;
  }>(request);
  const [result, receiver] = await Promise.all([
    checkCard({ ...body, exceptId: typeof body.exceptId === "string" ? body.exceptId : undefined }),
    matchReceivedBy(body.receivedBy),
  ]);
  return NextResponse.json({ ...result, receiver: receiver ? { id: receiver.id, label: `${receiver.fileNo} – ${receiver.name}` } : null });
}, (user) => canAddJobCards(user) || canEditJobCards(user));
