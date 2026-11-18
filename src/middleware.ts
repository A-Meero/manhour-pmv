import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CSRF_COOKIE_NAME, createCsrfToken } from "@/lib/csrf";

// Only issues the CSRF cookie on page loads (API routes are excluded so large uploads are not buffered here).
// on the server in every page (requireUser) and API route (withUser).
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (!request.cookies.get(CSRF_COOKIE_NAME)?.value) {
    response.cookies.set(CSRF_COOKIE_NAME, createCsrfToken(), {
      httpOnly: false,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|ahmadiah-.*\\.png).*)"],
};
