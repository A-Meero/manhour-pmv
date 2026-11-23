import { HttpError, withUser } from "@/lib/http";
import { xlsxResponse } from "@/lib/excel";
import { buildReport, canViewReports, isReportKind, reportRange } from "@/lib/reports";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ kind: string }> };

/** Excel report: /api/reports/<job-card-costs | asset-costs | team-hours | parts-issued>?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const GET = withUser<Ctx>(async (request, user, { params }) => {
  const { kind } = await params;
  if (!isReportKind(kind)) throw new HttpError(404, "Unknown report.");
  const url = new URL(request.url);
  const range = reportRange(url.searchParams.get("from"), url.searchParams.get("to"));
  const { data, fileName } = await buildReport(user, kind, range);
  await audit(user.id, "REPORT_EXPORTED", "Report", kind, { from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  return xlsxResponse(data, fileName);
}, canViewReports);
