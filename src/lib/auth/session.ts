import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { PERMISSION_KEYS, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { appConfig } from "@/lib/env";

export const SESSION_COOKIE_NAME = "manhour_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = { userId: string; sessionVersion: number; exp: number };

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  /** Admins can do everything */
  isAdmin: boolean;
  /** Union of the user's permission groups (all permissions for admins) */
  permissions: Set<Permission>;
  /** Names of the user's permission groups (for display) */
  groupNames: string[];
  employeeId: string | null;
  /** Employees this user is assigned to supervise */
  supervisedEmployeeIds: string[];
};

function sign(value: string): string {
  return createHmac("sha256", appConfig.authSecret()).update(value).digest("base64url");
}

function createToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function verifyToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const provided = Buffer.from(signature);
  const expected = Buffer.from(sign(encoded));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function secureCookies() {
  return process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true";
}

export function attachSessionCookie(response: NextResponse, userId: string, sessionVersion: number) {
  const token = createToken({ userId, sessionVersion, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies(),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies(),
    path: "/",
    maxAge: 0,
  });
}

/** Loads the signed-in user from the session cookie, or null. Inactive users and revoked sessions are rejected. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      active: true,
      employeeId: true,
      groups: { select: { group: { select: { name: true, permissions: true } } } },
      sessionVersion: true,
      supervising: { select: { employeeId: true } },
    },
  });

  if (!user || !user.active || user.sessionVersion !== payload.sessionVersion) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    permissions: user.isAdmin
      ? new Set(PERMISSION_KEYS)
      : new Set(user.groups.flatMap((g) => g.group.permissions).filter((p): p is Permission => (PERMISSION_KEYS as string[]).includes(p))),
    groupNames: user.groups.map((g) => g.group.name).sort(),
    employeeId: user.employeeId,
    supervisedEmployeeIds: user.supervising.map((entry) => entry.employeeId),
  };
}
