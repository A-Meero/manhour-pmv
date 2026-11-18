import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guards";
import { canDeleteRecords, canEditRecords, getViewScope, employeeScopeWhere } from "@/lib/auth/access";
import { buildRecordWhere, readFilters, recordInclude } from "@/lib/record-query";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import { toIsoDate } from "@/lib/dates";
import { PageHeader, Pagination } from "@/components/ui";
import { RecordsTable } from "@/components/records-table";
import type { ClientField } from "@/components/custom-field-inputs";

const PAGE_SIZE = 50;

export default async function RecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const filters = readFilters(await searchParams);
  const scope = getViewScope(user);
  const where = buildRecordWhere(filters, scope);

  const [total, sum, records, employees, fields] = await Promise.all([
    prisma.manHourRecord.count({ where }),
    prisma.manHourRecord.aggregate({ where, _sum: { hours: true } }),
    prisma.manHourRecord.findMany({
      where,
      include: recordInclude,
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.employee.findMany({
      where: employeeScopeWhere(scope),
      orderBy: { name: "asc" },
      select: { id: true, fileNo: true, name: true },
    }),
    getFieldDefinitions("RECORD"),
  ]);

  const params = {
    q: filters.q,
    employeeId: filters.employeeId,
    jobCard: filters.jobCard,
    from: filters.from,
    to: filters.to,
    source: filters.source,
  };

  return (
    <>
      <PageHeader title="Man-hour records" description={scope === "ALL" ? "All records." : "Records of the employees you supervise and your own."} />
      <RecordsTable
        filters={params}
        employees={employees}
        fields={toFieldDefs(fields) as ClientField[]}
        canEdit={canEditRecords(user)}
        canDelete={canDeleteRecords(user)}
        totalHours={Number(sum._sum.hours ?? 0)}
        total={total}
        records={records.map((record) => ({
          id: record.id,
          employeeId: record.employeeId,
          fileNo: record.employee.fileNo,
          employeeName: record.employee.name,
          jobTitle: record.jobTitle || record.employee.jobTitle,
          supervisorName: record.supervisorName,
          jobCard: record.jobCard.code,
          startDate: toIsoDate(record.startDate),
          endDate: toIsoDate(record.endDate),
          hours: Number(record.hours),
          remarks: record.remarks,
          customFields: record.customFields as Record<string, string | number | boolean | null>,
          preparedByName: record.preparedByName,
          preparedByDate: toIsoDate(record.preparedByDate),
          approvedByName: record.approvedByName,
          approvedByDate: toIsoDate(record.approvedByDate),
          source: record.source,
          scanId: record.scanId,
          createdBy: record.createdBy?.name ?? "",
          createdAt: record.createdAt.toISOString(),
        }))}
      />
      <Pagination page={filters.page} pageSize={PAGE_SIZE} total={total} basePath="/records" params={params} />
    </>
  );
}
