import { NextResponse } from "next/server";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { importJobCards } from "@/lib/masterdata";

/** Manual entry: one or more job card IDs (one per line). Existing IDs are skipped. */
export const POST = withUser(async (request, user) => {
  const body = await readJson<{ codes?: string[] | string; customFields?: Record<string, unknown> }>(request);
  const codes = (Array.isArray(body.codes) ? body.codes : String(body.codes ?? "").split(/[\n,;]/))
    .map((code) => code.trim())
    .filter(Boolean);
  if (codes.length === 0) throw new HttpError(400, "Enter at least one job card ID.");
  const summary = await importJobCards(
    codes.map((code, index) => ({ row: index + 1, code, fields: body.customFields })),
    { source: "MANUAL", actorId: user.id },
    codes.length > 1,
  );
  return NextResponse.json(summary);
}, canManageMasterData);
