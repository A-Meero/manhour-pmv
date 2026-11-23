import "server-only";

import { Prisma, type PartRequestLineStatus, type PartRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canManageInventory, canRequestParts } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import { parseAmount } from "@/lib/masterdata";
import { notify, usersWithPermission } from "@/lib/notifications";
import { audit } from "@/lib/audit";

/**
 * Spare part requests: the received-by team leader (or his supervisor, or an admin) lists what is needed on a job card,
 * one line per item (free text + quantity). Requests are never approved or rejected. The store issues what is in stock
 * as usual and ticks those lines done; for the rest it records an MR (material request, done outside the system) on the
 * line and ticks it done once the items arrived and were issued. A request is fulfilled when all its lines are done.
 */

const clean = (value: unknown, max: number) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const MAX_LINES = 50;

type LineInput = { description?: unknown; qty?: unknown };

export async function createPartRequest(user: CurrentUser, jobCardId: string, body: { lines?: LineInput[]; text?: unknown; note?: unknown }) {
  // { text } alone (older clients) = one line
  const raw: LineInput[] = Array.isArray(body.lines) ? body.lines : body.text !== undefined ? [{ description: body.text }] : [];
  if (raw.length > MAX_LINES) throw new HttpError(400, `At most ${MAX_LINES} lines per request.`);
  const lines: { line: number; description: string; qty: Prisma.Decimal | null }[] = [];
  for (const item of raw) {
    const description = clean(item?.description, 500);
    const qtyText = String(item?.qty ?? "").trim();
    if (!description && !qtyText) continue;
    if (!description) throw new HttpError(400, "Each line needs a description of the part.");
    const qty = qtyText ? parseAmount(qtyText) : undefined;
    if (qty === null || (qty !== undefined && !(qty > 0 && qty < 1e6))) throw new HttpError(400, `Quantity for "${description}" must be a number above 0.`);
    lines.push({ line: lines.length + 1, description, qty: qty === undefined ? null : new Prisma.Decimal(Math.round(qty * 1000) / 1000) });
  }
  if (!lines.length) throw new HttpError(400, "Add at least one line: which spare part is needed.");
  const note = String(body.note ?? "").trim().slice(0, 1000);

  const card = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { id: true, code: true, status: true, active: true, receivedById: true, asset: { select: { code: true } } },
  });
  if (!card) throw new HttpError(404, "Job card not found.");
  if (!canRequestParts(user, card)) throw new HttpError(403, "Only the team leader this job card was received by, his supervisor or an admin can request parts.");
  if (card.status !== "OPEN" || !card.active) throw new HttpError(400, "This job card is closed.");
  const request = await prisma.partRequest.create({ data: { jobCardId, requestedById: user.id, text: note, lines: { create: lines } } });
  await audit(user.id, "PART_REQUEST_CREATED", "PartRequest", request.id, {
    jobCard: card.code,
    lines: lines.map((l) => `${l.qty ? `${l.qty} × ` : ""}${l.description}`),
    note: note || undefined,
  });
  const summary = lines.map((l) => `${l.qty ? `${Number(l.qty)} × ` : ""}${l.description}`).join(", ");
  const store = (await usersWithPermission("inventory.manage")).filter((id) => id !== user.id);
  await notify(store, {
    kind: "PART_REQUEST",
    title: `Spare parts requested for job card ${card.code}${card.asset ? ` (${card.asset.code})` : ""}`,
    body: `${user.name}: ${summary.length > 160 ? `${summary.slice(0, 157)}…` : summary}`,
    link: `/job-cards/${jobCardId}#part-requests`,
    dedupeKey: `part-request:${request.id}`,
  });
  return request;
}

/** A request's status follows from its lines: all done → fulfilled; any MR raised → MR raised; otherwise open. */
function statusOf(lines: { status: PartRequestLineStatus }[]): PartRequestStatus {
  if (lines.length && lines.every((l) => l.status === "DONE")) return "FULFILLED";
  if (lines.some((l) => l.status === "MR_RAISED")) return "MR_RAISED";
  return "OPEN";
}

/** Updates the request's own status after its lines changed; tells the requester when it becomes fulfilled. */
async function syncRequest(user: CurrentUser, requestId: string) {
  const request = await prisma.partRequest.findUniqueOrThrow({
    where: { id: requestId },
    include: { lines: { select: { status: true } }, jobCard: { select: { id: true, code: true } } },
  });
  const status = statusOf(request.lines);
  if (status === request.status) return;
  const fulfilled = status === "FULFILLED";
  await prisma.partRequest.update({
    where: { id: requestId },
    data: { status, fulfilledById: fulfilled ? user.id : null, fulfilledAt: fulfilled ? new Date() : null },
  });
  if (fulfilled && request.requestedById && request.requestedById !== user.id) {
    await notify([request.requestedById], {
      kind: "PART_REQUEST_UPDATE",
      title: `Your parts request on job card ${request.jobCard.code} is fulfilled`,
      body: "All its lines are done.",
      link: `/job-cards/${request.jobCard.id}#part-requests`,
      dedupeKey: `part-request:${requestId}:fulfilled:${Date.now()}`,
    });
  }
}

/** Store manager, on one line: "mr" (with the MR no.), "done", or "reopen". */
export async function updatePartRequestLine(user: CurrentUser, lineId: string, body: { action?: unknown; mrNumber?: unknown }) {
  if (!canManageInventory(user)) throw new HttpError(403, "Only store managers can update part requests.");
  const line = await prisma.partRequestLine.findUnique({
    where: { id: lineId },
    include: { request: { select: { id: true, requestedById: true, jobCard: { select: { id: true, code: true } } } } },
  });
  if (!line) throw new HttpError(404, "Request line not found.");
  let mrNumber = "";
  if (body.action === "mr") {
    mrNumber = clean(body.mrNumber, 60);
    if (!mrNumber) throw new HttpError(400, "Enter the MR number.");
    await prisma.partRequestLine.update({ where: { id: lineId }, data: { status: "MR_RAISED", mrNumber, mrRaisedAt: new Date(), doneById: null, doneAt: null } });
  } else if (body.action === "done") {
    await prisma.partRequestLine.update({ where: { id: lineId }, data: { status: "DONE", doneById: user.id, doneAt: new Date() } });
  } else if (body.action === "reopen") {
    await prisma.partRequestLine.update({ where: { id: lineId }, data: { status: line.mrNumber ? "MR_RAISED" : "OPEN", doneById: null, doneAt: null } });
  } else {
    throw new HttpError(400, "Unknown action.");
  }
  await audit(user.id, `PART_REQUEST_LINE_${String(body.action).toUpperCase()}`, "PartRequest", line.request.id, {
    jobCard: line.request.jobCard.code,
    line: line.description,
    mrNumber: mrNumber || undefined,
  });
  if (body.action === "mr" && line.request.requestedById && line.request.requestedById !== user.id) {
    await notify([line.request.requestedById], {
      kind: "PART_REQUEST_UPDATE",
      title: `MR ${mrNumber} raised on job card ${line.request.jobCard.code}`,
      body: `For: ${line.qty ? `${Number(line.qty)} × ` : ""}${line.description}`,
      link: `/job-cards/${line.request.jobCard.id}#part-requests`,
      dedupeKey: `part-request-line:${lineId}:mr:${Date.now()}`,
    });
  }
  await syncRequest(user, line.request.id);
}

/** Store manager: tick every line of a request done at once ("Mark all done"). */
export async function completePartRequest(user: CurrentUser, requestId: string) {
  if (!canManageInventory(user)) throw new HttpError(403, "Only store managers can update part requests.");
  const request = await prisma.partRequest.findUnique({ where: { id: requestId }, select: { id: true, status: true, jobCard: { select: { code: true } } } });
  if (!request) throw new HttpError(404, "Request not found.");
  if (request.status === "FULFILLED") throw new HttpError(400, "This request is already fulfilled.");
  await prisma.partRequestLine.updateMany({ where: { requestId, status: { not: "DONE" } }, data: { status: "DONE", doneById: user.id, doneAt: new Date() } });
  await audit(user.id, "PART_REQUEST_FULFILLED", "PartRequest", requestId, { jobCard: request.jobCard.code });
  await syncRequest(user, requestId);
}

export async function openPartRequestCount() {
  return prisma.partRequest.count({ where: { status: { not: "FULFILLED" } } });
}

export type ClientRequestLine = {
  id: string;
  description: string;
  qty: number | null;
  status: PartRequestLineStatus;
  mrNumber: string;
  doneBy: string;
  doneAt: string | null;
};

export type ClientPartRequest = {
  id: string;
  /** Optional note */
  text: string;
  status: PartRequestStatus;
  requestedBy: string;
  createdAt: string;
  fulfilledAt: string | null;
  lines: ClientRequestLine[];
};

export const partRequestInclude = {
  requestedBy: { select: { name: true } },
  lines: { include: { doneBy: { select: { name: true } } }, orderBy: { line: "asc" } },
} as const satisfies Prisma.PartRequestInclude;

export function toClientRequest(r: Prisma.PartRequestGetPayload<{ include: typeof partRequestInclude }>): ClientPartRequest {
  return {
    id: r.id,
    text: r.text,
    status: r.status,
    requestedBy: r.requestedBy?.name ?? "",
    createdAt: r.createdAt.toISOString(),
    fulfilledAt: r.fulfilledAt?.toISOString() ?? null,
    lines: r.lines.map((l) => ({
      id: l.id,
      description: l.description,
      qty: l.qty === null ? null : Number(l.qty),
      status: l.status,
      mrNumber: l.mrNumber,
      doneBy: l.doneBy?.name ?? "",
      doneAt: l.doneAt?.toISOString() ?? null,
    })),
  };
}
