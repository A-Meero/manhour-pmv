import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { canBrowseJobCards } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { jobCardPhotoRoot } from "@/lib/job-card-entry";

type Ctx = { params: Promise<{ id: string }> };

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

/** The original photo / PDF the job card was added from. */
export const GET = withUser<Ctx>(async (_request, _user, { params }) => {
  const { id } = await params;
  const card = await prisma.jobCard.findUnique({ where: { id }, select: { photoPath: true, code: true } });
  if (!card?.photoPath) throw new HttpError(404, "This job card has no photo.");
  const root = jobCardPhotoRoot();
  const file = path.resolve(root, card.photoPath);
  if (!file.startsWith(root + path.sep)) throw new HttpError(404, "Photo not found.");
  const data = await readFile(file).catch(() => null);
  if (!data) throw new HttpError(404, "The photo file is missing.");
  const ext = card.photoPath.split(".").pop() ?? "";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="job-card-${card.code.replace(/[^\w.-]/g, "_")}.${ext}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}, canBrowseJobCards);
