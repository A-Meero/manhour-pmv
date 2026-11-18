import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { HttpError, withUser } from "@/lib/http";
import { canAccessScan, scanRoot } from "@/lib/scans";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withUser<Ctx>(async (_request, user, { params }) => {
  const { id } = await params;
  const scan = await prisma.scanSheet.findUnique({ where: { id } });
  if (!scan) throw new HttpError(404, "Scan not found.");
  if (!(await canAccessScan(user, scan))) throw new HttpError(403, "You cannot view this photo.");
  const root = scanRoot();
  const filePath = path.resolve(root, scan.filePath);
  if (!filePath.startsWith(root)) throw new HttpError(400, "Invalid file path.");
  const data = await readFile(filePath).catch(() => null);
  if (!data) throw new HttpError(404, "The photo file is missing.");
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": scan.mimeType, "Cache-Control": "private, max-age=3600" },
  });
});
