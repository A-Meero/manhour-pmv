import "server-only";

import nodemailer from "nodemailer";

/**
 * Outgoing email. Configured only through environment variables (never stored in the database):
 *
 *   MAIL_PROVIDER = graph | smtp | log      (default: graph when GRAPH_CLIENT_ID is set, smtp when SMTP_HOST is set)
 *   MAIL_FROM     = sender mailbox, e.g. noreply@company.com
 *
 *   graph — Microsoft 365 through Microsoft Graph (app registration with the Mail.Send application permission):
 *     GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
 *   smtp  — any SMTP server: SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ("true" for port 465), SMTP_USER, SMTP_PASSWORD
 *   log   — writes the email to the server log instead of sending it (testing)
 */

export type MailMessage = { to: string[]; subject: string; html: string; text: string };

const env = (name: string) => process.env[name]?.trim() ?? "";

// The PMV system's variable names are accepted too, so the same mail settings can be copied across.
const smtpPassword = () => env("SMTP_PASSWORD") || env("SMTP_PASS");
/** Sender: MAIL_FROM, else PMV's SMTP_FROM, else (SMTP only) the login user, like PMV does. */
const mailFrom = () => env("MAIL_FROM") || env("SMTP_FROM") || (provider() === "smtp" ? env("SMTP_USER") : "");

type Provider = "graph" | "smtp" | "log" | "none";

function provider(): Provider {
  const chosen = env("MAIL_PROVIDER").toLowerCase();
  if (chosen === "graph" || chosen === "smtp" || chosen === "log") return chosen;
  if (env("GRAPH_CLIENT_ID")) return "graph";
  if (env("SMTP_HOST")) return "smtp";
  return "none";
}

/** What the Settings screen shows: whether email is set up and what's missing. Never returns secrets. */
export function mailStatus() {
  const kind = provider();
  const missing: string[] = [];
  if (kind !== "log" && !mailFrom()) missing.push("MAIL_FROM");
  if (kind === "graph") for (const name of ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET"]) if (!env(name)) missing.push(name);
  if (kind === "smtp" && !env("SMTP_HOST")) missing.push("SMTP_HOST");
  const label = { graph: "Microsoft 365 (Graph)", smtp: "SMTP", log: "Server log only (testing)", none: "Not set up" }[kind];
  return { provider: kind, label, from: mailFrom(), ready: kind !== "none" && missing.length === 0, missing };
}

let graphToken: { value: string; expires: number } | null = null;

async function getGraphToken() {
  if (graphToken && graphToken.expires > Date.now() + 60_000) return graphToken.value;
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(env("GRAPH_TENANT_ID"))}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GRAPH_CLIENT_ID"),
      client_secret: env("GRAPH_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(`Microsoft sign-in failed: ${payload.error_description?.split("\r\n")[0] ?? `HTTP ${response.status}`}`);
  }
  graphToken = { value: payload.access_token, expires: Date.now() + (payload.expires_in ?? 3600) * 1000 };
  return graphToken.value;
}

async function sendGraph(message: MailMessage) {
  const token = await getGraphToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailFrom())}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: "HTML", content: message.html },
        toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Microsoft 365 refused the email: ${payload.error?.message ?? `HTTP ${response.status}`}`);
  }
}

let smtp: nodemailer.Transporter | null = null;

async function sendSmtp(message: MailMessage) {
  smtp ??= nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT")) || 587,
    secure: env("SMTP_SECURE") === "true",
    auth: env("SMTP_USER") ? { user: env("SMTP_USER"), pass: smtpPassword() } : undefined,
  });
  await smtp.sendMail({ from: mailFrom(), to: message.to.join(", "), subject: message.subject, html: message.html, text: message.text });
}

/** Sends an email. Throws with a readable reason when email isn't set up or the server refuses. */
export async function sendMail(message: MailMessage) {
  const to = Array.from(new Set(message.to.map((address) => address.trim()).filter(Boolean)));
  if (!to.length) throw new Error("No recipients.");
  const status = mailStatus();
  if (!status.ready) {
    throw new Error(status.provider === "none" ? "Email is not set up on the server." : `Email settings missing: ${status.missing.join(", ")}.`);
  }
  if (status.provider === "log") {
    console.info(`[mail] to=${to.join(",")} subject=${JSON.stringify(message.subject)}\n${message.text}`);
    return;
  }
  if (status.provider === "graph") await sendGraph({ ...message, to });
  else await sendSmtp({ ...message, to });
}

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
