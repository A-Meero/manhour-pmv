import { NextResponse } from "next/server";
import { canManageSettings } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { mailStatus, sendMail } from "@/lib/mail";
import { audit } from "@/lib/audit";

/** Sends a test email to the signed-in admin's own address. */
export const POST = withUser(async (_request, user) => {
  const status = mailStatus();
  try {
    await sendMail({
      to: [user.email],
      subject: "Man Hour System: test email",
      text: `This is a test email from the Man Hour System (${status.label}). Shift alerts will be sent the same way.`,
      html: `<p>This is a test email from the Man Hour System (${status.label}).</p><p>Shift alerts will be sent the same way.</p>`,
    });
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "The email could not be sent.");
  }
  await audit(user.id, "TEST_EMAIL_SENT", "Setting", "", { to: user.email, provider: status.provider });
  return NextResponse.json({ ok: true, message: `Test email sent to ${user.email}${status.provider === "log" ? " (written to the server log)" : ""}.` });
}, canManageSettings);
