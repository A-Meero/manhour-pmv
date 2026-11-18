import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type SheetPrefill = {
  employeeFileNo?: string;
  employeeName?: string;
  jobTitle?: string;
  supervisorName?: string;
};

const RED = rgb(0.89, 0.15, 0.17);
const GREY = rgb(0.85, 0.85, 0.85);
const BLACK = rgb(0, 0, 0);
export const SHEET_ROWS = 15;

function box(page: PDFPage, x: number, y: number, w: number, h: number, fill?: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: BLACK, borderWidth: 0.8, color: fill });
}

function text(page: PDFPage, value: string, x: number, y: number, font: PDFFont, size = 9, color = BLACK) {
  page.drawText(value, { x, y, size, font, color });
}

function centered(page: PDFPage, value: string, x: number, w: number, y: number, font: PDFFont, size = 9, color = BLACK) {
  const width = font.widthOfTextAtSize(value, size);
  page.drawText(value, { x: x + (w - width) / 2, y, size, font, color });
}

function fit(value: string, font: PDFFont, size: number, max: number) {
  let output = value;
  while (output.length > 1 && font.widthOfTextAtSize(output, size) > max) output = output.slice(0, -1);
  return output === value ? value : `${output.slice(0, -1)}…`;
}

/**
 * Printable man hour sheet (A4). Same layout as the company template, with Start/End date columns per row.
 * Header fields can be pre-filled for a specific employee.
 */
export async function buildSheetPdf(logoPng: Uint8Array, prefill: SheetPrefill = {}, copies = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Man Hour Sheet");
  pdf.setCreator("Man Hour System");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(logoPng);

  for (let copy = 0; copy < Math.max(1, copies); copy += 1) {
    const page = pdf.addPage([595.28, 841.89]);
    const left = 40;
    const width = 515.28;
    let y = 841.89 - 36;

    // Logo
    const logoWidth = 360;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    page.drawImage(logo, { x: left + (width - logoWidth) / 2, y: y - logoHeight, width: logoWidth, height: logoHeight });
    y -= logoHeight + 14;

    // Title bar
    page.drawRectangle({ x: left, y: y - 26, width, height: 26, color: RED });
    centered(page, "MAN HOUR SHEET", left, width, y - 18, bold, 15, rgb(1, 1, 1));
    y -= 26 + 12;

    // Header block
    const labelW = 160;
    const headerRows: [string, string][] = [
      ["Employee File No.", prefill.employeeFileNo ?? ""],
      ["Employee Name", prefill.employeeName ?? ""],
      ["Job Title", prefill.jobTitle ?? ""],
      ["Supervisor Name", prefill.supervisorName ?? ""],
    ];
    const headerH = 22;
    for (const [label, value] of headerRows) {
      box(page, left, y - headerH, labelW, headerH, GREY);
      box(page, left + labelW, y - headerH, width - labelW, headerH);
      text(page, label, left + 5, y - 15, bold, 10);
      if (value) text(page, fit(value, regular, 11, width - labelW - 12), left + labelW + 6, y - 15.5, regular, 11);
      y -= headerH;
    }
    y -= 14;

    // Table
    const cols = [
      { title: "No.", w: 30 },
      { title: "Job Card No.", w: 120 },
      { title: "Start Date", w: 72 },
      { title: "End Date", w: 72 },
      { title: "Hours Worked", w: 72 },
      { title: "Remarks", w: width - 30 - 120 - 72 - 72 - 72 },
    ];
    const headH = 24;
    const rowH = 25;
    let x = left;
    for (const col of cols) {
      box(page, x, y - headH, col.w, headH, GREY);
      centered(page, col.title, x, col.w, y - 15.5, bold, 9.5);
      x += col.w;
    }
    y -= headH;
    for (let row = 1; row <= SHEET_ROWS; row += 1) {
      x = left;
      cols.forEach((col, index) => {
        box(page, x, y - rowH, col.w, rowH);
        if (index === 0) centered(page, String(row), x, col.w, y - 16, regular, 9.5);
        if (index === 2 || index === 3) centered(page, "/      /", x, col.w, y - 16, regular, 9, rgb(0.6, 0.6, 0.6));
        x += col.w;
      });
      y -= rowH;
    }
    // Total row
    const totalLabelW = cols[0].w + cols[1].w + cols[2].w + cols[3].w;
    box(page, left, y - headH, totalLabelW, headH, GREY);
    box(page, left + totalLabelW, y - headH, cols[4].w, headH, GREY);
    box(page, left + totalLabelW + cols[4].w, y - headH, cols[5].w, headH, GREY);
    const label = "TOTAL HOURS";
    text(page, label, left + totalLabelW - bold.widthOfTextAtSize(label, 10) - 8, y - 15.5, bold, 10);
    y -= headH + 30;

    // Prepared / Approved
    const blockW = 220;
    const blocks = [left + 20, left + width - blockW - 20];
    ["Prepared By", "Approved By"].forEach((title, index) => {
      centered(page, title, blocks[index], blockW, y, bold, 10.5);
    });
    y -= 14;
    for (const line of ["Name:", "Signature:", "Date:"]) {
      y -= 24;
      for (const bx of blocks) {
        text(page, line, bx, y + 3, regular, 9.5);
        page.drawLine({ start: { x: bx, y }, end: { x: bx + blockW, y }, thickness: 0.8, color: BLACK });
      }
    }

    text(page, "Dates: DD/MM/YYYY. One line per job card. Write clearly in the boxes.", left, 28, regular, 7.5, rgb(0.4, 0.4, 0.4));
  }

  return pdf.save();
}
