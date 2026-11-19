import { prisma } from "@/lib/prisma";
import { canViewCosts, getViewScope } from "@/lib/auth/access";
import { round3 } from "@/lib/money";
import { withUser } from "@/lib/http";
import { buildRecordWhere, readFilters, recordInclude } from "@/lib/record-query";
import { buildSheet, xlsxResponse } from "@/lib/excel";

const SOURCE_LABEL: Record<string, string> = { MANUAL: "Manual", EXCEL: "Excel", API: "API", PHOTO: "Photo", QR: "QR scan" };
import { getFieldDefinitions } from "@/lib/fields";

export const GET = withUser(async (request, user) => {
  const filters = readFilters(new URL(request.url).searchParams);
  const where = buildRecordWhere(filters, getViewScope(user));
  const [records, fields] = await Promise.all([
    prisma.manHourRecord.findMany({ where, include: recordInclude, orderBy: [{ startDate: "desc" }, { createdAt: "desc" }], take: 100000 }),
    getFieldDefinitions("RECORD", true),
  ]);
  const data = await buildSheet(
    "Records",
    [
      { header: "Employee File No.", key: "fileNo" },
      { header: "Employee Name", key: "name", width: 28 },
      { header: "Job Title", key: "jobTitle" },
      { header: "Supervisor Name", key: "supervisor", width: 24 },
      { header: "Job Card No.", key: "jobCard" },
      { header: "Start Date", key: "startDate", date: true },
      { header: "End Date", key: "endDate", date: true },
      { header: "Hours Worked", key: "hours" },
      ...(canViewCosts(user)
        ? [
            { header: "Hourly Rate (KWD)", key: "rate" },
            { header: "Labour Cost (KWD)", key: "labourCost" },
          ]
        : []),
      { header: "Remarks", key: "remarks", width: 30 },
      ...fields.map((field) => ({ header: field.label, key: `f_${field.key}` })),
      { header: "Prepared By", key: "preparedBy" },
      { header: "Prepared Date", key: "preparedDate", date: true },
      { header: "Approved By", key: "approvedBy" },
      { header: "Approved Date", key: "approvedDate", date: true },
      { header: "Source", key: "source" },
      { header: "Entered By", key: "createdBy" },
      { header: "Entered At", key: "createdAt", width: 20 },
    ],
    records.map((record) => {
      const custom = (record.customFields ?? {}) as Record<string, unknown>;
      return {
        fileNo: record.employee.fileNo,
        name: record.employee.name,
        jobTitle: record.jobTitle || record.employee.jobTitle,
        supervisor: record.supervisorName,
        jobCard: record.jobCard.code,
        startDate: record.startDate,
        endDate: record.endDate,
        hours: Number(record.hours),
        ...(canViewCosts(user)
          ? (() => {
              const rate = Number(record.hourlyRate ?? record.employee.hourlyRate);
              return { rate, labourCost: round3(rate * Number(record.hours)) };
            })()
          : {}),
        remarks: record.remarks,
        ...Object.fromEntries(fields.map((field) => [`f_${field.key}`, custom[field.key] ?? ""])),
        preparedBy: record.preparedByName,
        preparedDate: record.preparedByDate,
        approvedBy: record.approvedByName,
        approvedDate: record.approvedByDate,
        source: SOURCE_LABEL[record.source] ?? record.source,
        createdBy: record.createdBy?.name ?? "",
        createdAt: record.createdAt.toISOString().replace("T", " ").slice(0, 16),
      };
    }),
  );
  return xlsxResponse(data, `manhour-records-${new Date().toISOString().slice(0, 10)}.xlsx`);
});
