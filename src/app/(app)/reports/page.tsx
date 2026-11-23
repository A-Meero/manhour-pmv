import { requirePage } from "@/lib/auth/guards";
import { canRunReport, canViewReports, REPORTS, type ReportKind } from "@/lib/reports";
import { toIsoDate, todayUtc } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { ReportsForm } from "@/components/reports-form";

/** Excel reports for a period: job card costs, asset costs, team hours, parts issued (each by permission). */
export default async function ReportsPage() {
  const user = await requirePage(canViewReports);
  const today = todayUtc();
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const reports = (Object.keys(REPORTS) as ReportKind[]).filter((kind) => canRunReport(user, kind)).map((kind) => ({ kind, ...REPORTS[kind] }));
  return (
    <>
      <PageHeader
        title="Reports"
        description="Excel downloads for a period. Hours and labour count records by their start date; parts count issues and returns by their date."
      />
      <ReportsForm reports={reports} defaultFrom={toIsoDate(monthStart)} defaultTo={toIsoDate(today)} />
    </>
  );
}
