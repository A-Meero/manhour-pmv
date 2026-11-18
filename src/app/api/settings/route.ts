import { NextResponse } from "next/server";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { saveSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";

type Body = {
  dailyHourLimit?: string;
  weeklyHourLimit?: string;
  weekStartDay?: string;
  claudeApiKey?: string;
  clearClaudeApiKey?: boolean;
  claudeModel?: string;
  tesseractLanguage?: string;
};

function limit(value: string | undefined, label: string) {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  if (text === "") return "";
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new HttpError(400, `${label} must be a positive number or empty for no limit.`);
  return String(parsed);
}

export const PUT = withUser(async (request, user) => {
  const body = await readJson<Body>(request);
  const values: Record<string, string> = {};
  const daily = limit(body.dailyHourLimit, "Daily limit");
  const weekly = limit(body.weeklyHourLimit, "Weekly limit");
  if (daily !== undefined) values.dailyHourLimit = daily;
  if (weekly !== undefined) values.weeklyHourLimit = weekly;
  if (body.weekStartDay !== undefined) {
    const day = Number(body.weekStartDay);
    if (!Number.isInteger(day) || day < 0 || day > 6) throw new HttpError(400, "Invalid week start day.");
    values.weekStartDay = String(day);
  }
  if (body.clearClaudeApiKey) values.claudeApiKey = "";
  else if (body.claudeApiKey && body.claudeApiKey.trim()) values.claudeApiKey = body.claudeApiKey.trim();
  if (body.claudeModel !== undefined) values.claudeModel = body.claudeModel.trim();
  if (body.tesseractLanguage !== undefined) values.tesseractLanguage = body.tesseractLanguage.trim() || "eng";
  await saveSettings(values);
  await audit(user.id, "SETTINGS_UPDATED", "Setting", "", {
    ...values,
    ...(values.claudeApiKey !== undefined ? { claudeApiKey: values.claudeApiKey ? "(set)" : "(cleared)" } : {}),
  });
  return NextResponse.json({ ok: true });
}, canManageMasterData);
