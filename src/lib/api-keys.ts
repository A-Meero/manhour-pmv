import "server-only";

import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const API_SCOPES = ["JOB_CARDS", "EMPLOYEES"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateKey() {
  const key = `mh_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), keyHash: hashKey(key) };
}

/** Reads `Authorization: Bearer <key>` or `X-API-Key: <key>` and checks the scope. */
export async function authenticateApiKey(request: Request, scope: ApiScope) {
  const header = request.headers.get("authorization") ?? "";
  const key = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : request.headers.get("x-api-key")?.trim();
  if (!key) return { error: "Missing API key", status: 401 as const };
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(key) } });
  if (!record || !record.active) return { error: "Invalid API key", status: 401 as const };
  if (!record.scopes.includes(scope)) return { error: `API key is not allowed to import ${scope.toLowerCase().replace("_", " ")}`, status: 403 as const };
  await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return { apiKey: record };
}
