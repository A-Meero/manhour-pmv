import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";
import { importEmployees } from "@/lib/masterdata";

const MAX_ITEMS = 5000;

/**
 * POST /api/v1/employees
 * Body: { "employees": [{ "fileNo": "1023", "name": "…", "jobTitle": "…", "supervisorEmails": ["a@x.com"], "fields": { … } }] }
 * Existing file numbers are skipped. Response: { created, skipped, failed, issues[] }.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiKey(request, "EMPLOYEES");
  if ("error" in auth) return NextResponse.json({ message: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as unknown;
  const list = Array.isArray(body) ? body : (body as { employees?: unknown[] } | null)?.employees;
  if (!Array.isArray(list) || list.length === 0) {
    return NextResponse.json({ message: 'Send { "employees": [...] }.' }, { status: 400 });
  }
  if (list.length > MAX_ITEMS) return NextResponse.json({ message: `Send at most ${MAX_ITEMS} employees per request.` }, { status: 413 });
  const items = list.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      row: index + 1,
      fileNo: item.fileNo,
      name: item.name,
      jobTitle: item.jobTitle,
      supervisors: item.supervisorEmails ?? item.supervisors,
      fields: item.fields as Record<string, unknown> | undefined,
    };
  });
  const summary = await importEmployees(items, { source: "API", apiKeyId: auth.apiKey.id, fileName: auth.apiKey.name });
  return NextResponse.json(summary);
}
