import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { importJobCards } from "@/lib/job-card-entry";

const MAX_ITEMS = 5000;

/**
 * POST /api/v1/job-cards
 * Body: ["JC-1001", "JC-1002"]  or  { "jobCards": [{ "id": "JC-1001", "assetCode": "SUV172", "dateIn": "2026-11-21", "jobType": "Break Down",
 *   "project": "…", "workDone": "line 1; line 2", "fields": { "<custom field key>": "…" } }] }
 * Header fields (all optional): assetCode / plateNo / chassisNo, dateIn, dateOut, previousReading, currentReading, jobType,
 * repairAt, repairType (Workshop / Onsite; guessed from repairAt when left out), project, operatorName, receivedBy (matched to an
 * employee by name, who is notified), createdByName, workDone. The asset must exist and must not have an open job card.
 * Existing IDs are skipped. Response: { created, skipped, failed, issues[] }.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiKey(request, "JOB_CARDS");
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as unknown;
  const list = Array.isArray(body) ? body : (body as { jobCards?: unknown[] } | null)?.jobCards;
  if (!Array.isArray(list) || list.length === 0) {
    return NextResponse.json({ message: 'Send a JSON array of job card IDs or { "jobCards": [...] }.' }, { status: 400 });
  }
  if (list.length > MAX_ITEMS) return NextResponse.json({ message: `Send at most ${MAX_ITEMS} job cards per request.` }, { status: 413 });
  const items = list.map((entry, index) => {
    if (entry && typeof entry === "object") {
      const item = entry as Record<string, unknown> & { id?: unknown; code?: unknown; fields?: Record<string, unknown> };
      return { ...item, row: index + 1, code: item.id ?? item.code, fields: item.fields };
    }
    return { row: index + 1, code: entry };
  });
  const summary = await importJobCards(items, { source: "API", apiKeyId: auth.apiKey.id, fileName: auth.apiKey.name });
  return NextResponse.json(summary);
}
