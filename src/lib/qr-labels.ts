import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { qrPng } from "@/lib/qr";

const RED = rgb(0.89, 0.15, 0.17);
const GREY = rgb(0.45, 0.45, 0.45);

/** A4 sheets of job card QR labels, 3 × 4 per page, with cut lines. */
export async function buildQrLabelsPdf(cards: { code: string; link: string }[], logoPng?: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Job card QR labels");
  pdf.setCreator("Man Hour System");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const logo = logoPng ? await pdf.embedPng(logoPng) : null;

  const pageW = 595.28;
  const pageH = 841.89;
  const cols = 3;
  const rows = 4;
  const margin = 24;
  const cellW = (pageW - margin * 2) / cols;
  const cellH = (pageH - margin * 2) / rows;
  const perPage = cols * rows;

  for (let index = 0; index < cards.length; index += 1) {
    if (index % perPage === 0) pdf.addPage([pageW, pageH]);
    const page = pdf.getPages()[pdf.getPageCount() - 1];
    const slot = index % perPage;
    const x = margin + (slot % cols) * cellW;
    const y = pageH - margin - (Math.floor(slot / cols) + 1) * cellH;
    const card = cards[index];

    page.drawRectangle({ x, y, width: cellW, height: cellH, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5, borderDashArray: [3, 3] });
    const qr = await pdf.embedPng(await qrPng(card.link, 480));
    const qrSize = Math.min(cellW - 30, cellH - 70);
    page.drawImage(qr, { x: x + (cellW - qrSize) / 2, y: y + 46, width: qrSize, height: qrSize });
    if (logo) {
      const logoW = 22;
      page.drawImage(logo, { x: x + 8, y: y + cellH - 8 - (logo.height / logo.width) * logoW, width: logoW, height: (logo.height / logo.width) * logoW });
    }

    let size = 16;
    while (size > 8 && bold.widthOfTextAtSize(card.code, size) > cellW - 16) size -= 1;
    const codeW = bold.widthOfTextAtSize(card.code, size);
    page.drawText(card.code, { x: x + (cellW - codeW) / 2, y: y + 26, size, font: bold, color: RED });
    const hint = "Scan to start / stop work";
    const hintW = regular.widthOfTextAtSize(hint, 8);
    page.drawText(hint, { x: x + (cellW - hintW) / 2, y: y + 12, size: 8, font: regular, color: GREY });
  }
  if (cards.length === 0) {
    const page = pdf.addPage([pageW, pageH]);
    page.drawText("No job cards to print.", { x: margin, y: pageH - margin - 20, size: 14, font: regular });
  }
  return pdf.save();
}
