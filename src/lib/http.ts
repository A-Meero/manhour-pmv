import "server-only";

import { NextResponse } from "next/server";
import { validateCsrf } from "@/lib/csrf";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { methodAllowed } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { LOGGING_METHOD_INFO, type LoggingMethod } from "@/lib/logging-methods";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function jsonError(status: number, message: string, details?: unknown) {
  return NextResponse.json({ message, details }, { status });
}

type Handler<C> = (request: Request, user: CurrentUser, context: C) => Promise<Response>;

/**
 * Wraps a route handler: enforces CSRF on writes, requires a signed-in user,
 * optionally checks a permission, and turns HttpError into JSON responses.
 */
export function withUser<C = unknown>(handler: Handler<C>, check?: (user: CurrentUser) => boolean) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      if (!validateCsrf(request)) return jsonError(403, "Security check failed. Refresh the page and try again.");
      const user = await getCurrentUser();
      if (!user) return jsonError(401, "Your session has expired. Please sign in again.");
      if (check && !check(user)) return jsonError(403, "You do not have permission to do this.");
      return await handler(request, user, context);
    } catch (error) {
      if (error instanceof HttpError) return jsonError(error.status, error.message, error.details);
      console.error(error);
      return jsonError(500, "Something went wrong. Please try again.");
    }
  };
}

/** Throws 403 when a logging way is switched off in Settings (admins are never blocked). */
export async function assertMethod(user: CurrentUser, method: LoggingMethod) {
  const { methods } = await getSettings();
  if (!methodAllowed(user, methods, method)) {
    throw new HttpError(403, `${LOGGING_METHOD_INFO[method].label} is switched off by the administrator.`);
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}
