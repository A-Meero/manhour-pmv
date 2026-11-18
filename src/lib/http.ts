import "server-only";

import { NextResponse } from "next/server";
import { validateCsrf } from "@/lib/csrf";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";

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

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}
