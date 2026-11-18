import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachSessionCookie } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/csrf";
import { audit } from "@/lib/audit";

export async function POST(request: Request) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ message: "Security check failed. Refresh the page and try again." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email || !body.password) {
    return NextResponse.json({ message: "Email and password are required." }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await compare(body.password, user.passwordHash))) {
    return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  attachSessionCookie(response, user.id, user.sessionVersion);
  await audit(user.id, "LOGIN", "User", user.id);
  return response;
}
