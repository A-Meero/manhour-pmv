import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getEntryScope, getViewScope, scopeAllows } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { buildSheetPdf } from "@/lib/pdf-template";

/** Printable sheet. ?employeeId= pre-fills the header, ?copies= adds pages. */
export const GET = withUser(async (request, user) => {
  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId");
  const copies = Math.min(50, Math.max(1, Number(url.searchParams.get("copies")) || 1));
  let prefill = {};
  if (employeeId) {
    if (!scopeAllows(getEntryScope(user), employeeId) && !scopeAllows(getViewScope(user), employeeId)) {
      throw new HttpError(403, "You cannot print a sheet for this employee.");
    }
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { supervisors: { include: { supervisor: { select: { name: true } } } } },
    });
    if (!employee) throw new HttpError(404, "Employee not found.");
    prefill = {
      employeeFileNo: employee.fileNo,
      employeeName: employee.name,
      jobTitle: employee.jobTitle,
      supervisorName: employee.supervisors.map((entry) => entry.supervisor.name).join(", "),
    };
  }
  const logo = await readFile(path.join(process.cwd(), "public", "ahmadiah-logo.png"));
  const pdf = await buildSheetPdf(new Uint8Array(logo), prefill, copies);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="man-hour-sheet.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
