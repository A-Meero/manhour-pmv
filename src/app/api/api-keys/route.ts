import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { API_SCOPES, generateKey } from "@/lib/api-keys";
import { audit } from "@/lib/audit";

/** Creates an API key for another system. The full key is returned only once. */
export const POST = withUser(async (request, user) => {
  const body = await readJson<{ name?: string; scopes?: string[] }>(request);
  const name = body.name?.trim();
  if (!name) throw new HttpError(400, "Give the key a name (e.g. the system that will use it).");
  const scopes = (body.scopes ?? []).filter((scope) => (API_SCOPES as readonly string[]).includes(scope));
  if (scopes.length === 0) throw new HttpError(400, "Choose at least one permission.");
  const { key, prefix, keyHash } = generateKey();
  const created = await prisma.apiKey.create({ data: { name, prefix, keyHash, scopes, createdById: user.id } });
  await audit(user.id, "API_KEY_CREATED", "ApiKey", created.id, { name, scopes });
  return NextResponse.json({ id: created.id, key });
}, canManageMasterData);
