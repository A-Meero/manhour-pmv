import "server-only";

import ExcelJS from "exceljs";
import type { FieldDef } from "@/lib/fields";

export type TemplateKind = "job-cards" | "employees" | "records" | "parts" | "assets";

type Column = { header: string; key: string; width: number; note: string; required?: boolean; format?: "date" | "number" };

const RED = "FFE3262B";

export const STANDARD_COLUMNS: Record<TemplateKind, Column[]> = {
  "job-cards": [
    { header: "Job Card ID", key: "code", width: 18, note: "Unique job card number (Rep.Order Number on the printed card). Existing numbers are skipped.", required: true },
    { header: "Asset Code", key: "assetCode", width: 14, note: "Optional. \"Code\" on the printed card. Must exist in Assets (or give the plate / chassis no.)." },
    { header: "Plate No.", key: "plateNo", width: 14, note: "Optional. Used to find the asset when there is no asset code." },
    { header: "Chassis No.", key: "chassisNo", width: 22, note: "Optional. Used to find the asset when there is no asset code or plate." },
    { header: "Date In", key: "dateIn", width: 12, note: "Optional, DD/MM/YYYY", format: "date" },
    { header: "Job Type", key: "jobType", width: 16, note: "Optional, e.g. Break Down, Routine Check, Traffic Passing." },
    { header: "Previous HM/KM", key: "previousReading", width: 14, note: "Optional meter reading.", format: "number" },
    { header: "Current HM/KM", key: "currentReading", width: 14, note: "Optional meter reading.", format: "number" },
    { header: "Repair At", key: "repairAt", width: 22, note: "Optional." },
    { header: "Project", key: "project", width: 24, note: "Optional." },
    { header: "Operator Name", key: "operatorName", width: 22, note: "Optional." },
    { header: "Received By", key: "receivedBy", width: 22, note: "Optional." },
    { header: "Created By", key: "createdByName", width: 18, note: "Optional. As printed on the card." },
    { header: "Work Done", key: "workDone", width: 40, note: "Optional. Task lines; separate several with a semicolon (;)." },
  ],
  assets: [
    { header: "Asset Code", key: "assetCode", width: 14, note: "Unique asset code (\"Code\" on the job card, e.g. SUV172). Existing codes are skipped.", required: true },
    { header: "Description", key: "description", width: 34, note: "e.g. MITSUBISHI PAJERO SPORT SUV" },
    { header: "Category", key: "category", width: 16, note: "Optional, e.g. SUV, Pick Up, Dump Truck, Generator." },
    { header: "Location / Department", key: "location", width: 22, note: "Optional." },
    { header: "Make", key: "make", width: 14, note: "Optional." },
    { header: "Model", key: "model", width: 16, note: "Optional." },
    { header: "Serial No.", key: "serialNo", width: 18, note: "Optional." },
    { header: "Chassis No.", key: "chassisNo", width: 22, note: "Optional." },
    { header: "Plate No.", key: "plateNo", width: 14, note: "Optional, e.g. 40/37025." },
    { header: "Year of Make", key: "yearOfMake", width: 12, note: "Optional, e.g. 2015.", format: "number" },
    { header: "Purchase Date", key: "purchaseDate", width: 14, note: "Optional, DD/MM/YYYY. Depreciation counts from this date.", format: "date" },
    { header: "Purchase Value", key: "purchaseValue", width: 14, note: "Optional, KWD.", format: "number" },
    { header: "Depreciation Rate %", key: "depreciationRate", width: 16, note: "Optional. Straight line, % of the purchase value per year (e.g. 20).", format: "number" },
    { header: "Notes", key: "notes", width: 30, note: "Optional." },
  ],
  employees: [
    { header: "Employee File No.", key: "fileNo", width: 20, note: "Unique employee file number. Existing file numbers are skipped.", required: true },
    { header: "Employee Name", key: "name", width: 30, note: "Full name.", required: true },
    { header: "Job Title", key: "jobTitle", width: 24, note: "Optional." },
    {
      header: "Supervisor Emails",
      key: "supervisors",
      width: 36,
      note: "Optional. Login emails of the supervisors (any user type). Separate several with a comma.",
    },
    { header: "Hourly Rate", key: "hourlyRate", width: 14, note: "Optional labour cost per hour in KWD (e.g. 2.750).", format: "number" },
    { header: "Shift", key: "shift", width: 16, note: "Optional. Name of a shift from Settings › Shifts (e.g. Morning)." },
  ],
  parts: [
    { header: "Part No.", key: "partNo", width: 20, note: "Unique part number. Existing part numbers are skipped.", required: true },
    { header: "Part Name", key: "name", width: 34, note: "Description of the part.", required: true },
    { header: "Unit", key: "unit", width: 10, note: "Optional, e.g. pcs, ltr, m, kg. Default pcs." },
    { header: "Unit Cost", key: "unitCost", width: 14, note: "Cost of one unit in KWD (e.g. 1.250).", required: true, format: "number" },
    { header: "Opening Stock", key: "qtyOnHand", width: 14, note: "Optional quantity in the store now. Default 0.", format: "number" },
    { header: "Low Stock Level", key: "minQty", width: 16, note: "Optional. The part is highlighted when stock is at or below this.", format: "number" },
  ],
  records: [
    { header: "Employee File No.", key: "employeeFileNo", width: 20, note: "Must exist in the employee list.", required: true },
    { header: "Job Card No.", key: "jobCardCode", width: 22, note: "Must exist in the job card list. One record per employee per job card.", required: true },
    { header: "Start Date", key: "startDate", width: 14, note: "DD/MM/YYYY", required: true, format: "date" },
    { header: "End Date", key: "endDate", width: 14, note: "DD/MM/YYYY (same as start for a single day)", required: true, format: "date" },
    { header: "Hours Worked", key: "hours", width: 14, note: "Total hours for the job; decimals allowed (e.g. 7.5).", required: true, format: "number" },
    { header: "Remarks", key: "remarks", width: 30, note: "Optional." },
    { header: "Prepared By", key: "preparedByName", width: 22, note: "Optional name." },
    { header: "Prepared Date", key: "preparedByDate", width: 14, note: "Optional, DD/MM/YYYY", format: "date" },
    { header: "Approved By", key: "approvedByName", width: 22, note: "Optional name." },
    { header: "Approved Date", key: "approvedByDate", width: 14, note: "Optional, DD/MM/YYYY", format: "date" },
  ],
};

const HEADER_ALIASES: Record<string, string[]> = {
  code: ["job card id", "job card no.", "job card no", "job card", "jobcard", "id"],
  fileNo: ["employee file no.", "employee file no", "file no.", "file no", "file number"],
  name: ["employee name", "name"],
  jobTitle: ["job title", "title"],
  supervisors: ["supervisor emails", "supervisor email", "supervisors"],
  employeeFileNo: ["employee file no.", "employee file no", "file no.", "file no"],
  jobCardCode: ["job card no.", "job card no", "job card id", "job card"],
  startDate: ["start date", "from"],
  endDate: ["end date", "to"],
  hours: ["hours worked", "hours"],
  remarks: ["remarks", "remark", "notes"],
  preparedByName: ["prepared by"],
  preparedByDate: ["prepared date", "prepared by date"],
  approvedByName: ["approved by"],
  approvedByDate: ["approved date", "approved by date"],
  hourlyRate: ["hourly rate", "rate", "rate per hour"],
  shift: ["shift", "shift name"],
  partNo: ["part no.", "part no", "part number", "part #"],
  unit: ["unit", "uom"],
  unitCost: ["unit cost", "cost", "unit price", "price"],
  qtyOnHand: ["opening stock", "quantity", "qty", "stock", "qty on hand"],
  minQty: ["low stock level", "min qty", "minimum", "reorder level"],
  assetCode: ["asset code", "code", "asset", "equipment code"],
  plateNo: ["plate no.", "plate no", "plate", "plate number"],
  chassisNo: ["chassis no.", "chassis no", "chassis", "vin", "chass"],
  dateIn: ["date in"],
  jobType: ["job type"],
  previousReading: ["previous hm/km", "previous reading", "previous km"],
  currentReading: ["current hm/km", "current reading", "current km", "hm/km", "km"],
  repairAt: ["repair at"],
  project: ["project"],
  operatorName: ["operator name", "operator"],
  receivedBy: ["received by"],
  createdByName: ["created by"],
  workDone: ["work done", "tasks", "task description"],
  description: ["description", "asset description", "name"],
  category: ["category", "type", "asset type"],
  location: ["location / department", "location", "department"],
  make: ["make", "manufacturer"],
  model: ["model"],
  serialNo: ["serial no.", "serial no", "serial number", "serial"],
  yearOfMake: ["year of make", "yom", "year"],
  purchaseDate: ["purchase date"],
  purchaseValue: ["purchase value", "purchase price", "value"],
  depreciationRate: ["depreciation rate %", "depreciation rate", "depreciation %", "depreciation"],
  notes: ["notes", "note"],
};

const normalizeHeader = (value: string) => value.replace(/\*/g, "").trim().toLowerCase().replace(/\s+/g, " ");

function fieldColumn(field: FieldDef): Column {
  const formats: Record<string, string> = {
    TEXT: "Text",
    NUMBER: "Number",
    DATE: "DD/MM/YYYY",
    SELECT: `One of: ${field.options.join(", ")}`,
    CHECKBOX: "Yes / No",
  };
  return {
    header: field.label,
    key: `field:${field.key}`,
    width: Math.max(14, field.label.length + 4),
    note: `${field.required ? "Required" : "Optional"} custom field. ${formats[field.type] ?? ""}`,
    required: field.required,
    format: field.type === "DATE" ? "date" : field.type === "NUMBER" ? "number" : undefined,
  };
}

export async function buildTemplate(kind: TemplateKind, fields: FieldDef[]): Promise<ArrayBuffer> {
  const columns = [...STANDARD_COLUMNS[kind], ...fields.map(fieldColumn)];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Man Hour System";
  const sheet = workbook.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key,
    width: column.width,
  }));
  const header = sheet.getRow(1);
  header.height = 22;
  header.eachCell((cell, index) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.note = columns[index - 1]?.note ?? "";
  });
  columns.forEach((column, index) => {
    const col = sheet.getColumn(index + 1);
    if (column.format === "date") col.numFmt = "dd/mm/yyyy";
    if (column.format === "number") col.numFmt = "0.00";
    if (column.key.startsWith("field:")) {
      const field = fields.find((f) => `field:${f.key}` === column.key);
      if (field?.type === "SELECT" && field.options.length) {
        for (let row = 2; row <= 1000; row += 1) {
          sheet.getCell(row, index + 1).dataValidation = {
            type: "list",
            allowBlank: !field.required,
            formulae: [`"${field.options.join(",").replace(/"/g, "")}"`],
          };
        }
      }
    }
  });

  const help = workbook.addWorksheet("Instructions");
  help.columns = [
    { header: "Column", key: "column", width: 26 },
    { header: "How to fill it", key: "note", width: 90 },
  ];
  help.getRow(1).font = { bold: true };
  columns.forEach((column) => help.addRow({ column: column.header + (column.required ? " *" : ""), note: column.note }));
  help.addRow({});
  help.addRow({ column: "Notes", note: "Fill the 'Data' sheet only, starting at row 2. Columns marked * are required." });
  help.addRow({ column: "", note: "Valid rows are imported; invalid rows are listed in a report you can download after the import." });

  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if ("error" in value) return null;
    return null;
  }
  if (typeof value === "string") return value.trim();
  return value;
}

export type ParsedRow = { row: number; values: Record<string, unknown>; fields: Record<string, unknown> };

/**
 * Reads the first sheet named "Data" (or the first sheet). Row 1 must hold the headers.
 * Standard columns are matched by header name; other headers are matched to custom field labels.
 */
export async function parseWorkbook(
  data: ArrayBuffer,
  kind: TemplateKind,
  fields: FieldDef[],
): Promise<{ rows: ParsedRow[]; missingColumns: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.getWorksheet("Data") ?? workbook.worksheets[0];
  if (!sheet) return { rows: [], missingColumns: ["(no worksheet found)"] };

  const standard = STANDARD_COLUMNS[kind];
  const columnFor = new Map<number, { type: "std" | "field"; key: string }>();
  sheet.getRow(1).eachCell((cell, col) => {
    const header = normalizeHeader(String(cellValue(cell.value) ?? ""));
    if (!header) return;
    const std = standard.find(
      (column) => normalizeHeader(column.header) === header || (HEADER_ALIASES[column.key] ?? []).includes(header),
    );
    if (std) {
      columnFor.set(col, { type: "std", key: std.key });
      return;
    }
    const field = fields.find((f) => normalizeHeader(f.label) === header || f.key === header);
    if (field) columnFor.set(col, { type: "field", key: field.key });
  });

  const found = new Set(Array.from(columnFor.values()).map((entry) => entry.key));
  const missingColumns = standard.filter((column) => column.required && !found.has(column.key)).map((c) => c.header);

  const rows: ParsedRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, unknown> = {};
    const fieldValues: Record<string, unknown> = {};
    let hasData = false;
    columnFor.forEach((target, col) => {
      const value = cellValue(row.getCell(col).value);
      if (value !== null && value !== "") hasData = true;
      if (target.type === "std") values[target.key] = value;
      else fieldValues[target.key] = value;
    });
    if (hasData) rows.push({ row: rowNumber, values, fields: fieldValues });
  });

  return { rows, missingColumns };
}

export async function buildSheet(
  name: string,
  columns: { header: string; key: string; width?: number; date?: boolean }[],
  rows: Record<string, unknown>[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ header: column.header, key: column.key, width: column.width ?? 18 }));
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
  });
  columns.forEach((column, index) => {
    if (column.date) sheet.getColumn(index + 1).numFmt = "dd/mm/yyyy";
  });
  rows.forEach((row) => sheet.addRow(row));
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export function xlsxResponse(data: ArrayBuffer, fileName: string) {
  return new Response(data, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
