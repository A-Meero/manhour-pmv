import { NextResponse } from "next/server";
import { canManageMasterData } from "@/lib/auth/access";
import { HttpError, readJson, withUser } from "@/lib/http";
import { saveSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { LOGGING_METHODS, LOGGING_METHOD_INFO, type LoggingMethod } from "@/lib/logging-methods";

type Body = {
  dailyHourLimit?: string;
  weeklyHourLimit?: string;
  weekStartDay?: string;
  tesseractLanguage?: string;
  methods?: Partial<Record<LoggingMethod, boolean>>;
  maxSessionHours?: string;
  appBaseUrl?: string;
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
  if (body.tesseractLanguage !== undefined) values.tesseractLanguage = body.tesseractLanguage.trim() || "eng";
  for (const method of LOGGING_METHODS) {
    const value = body.methods?.[method];
    if (value !== undefined) values[LOGGING_METHOD_INFO[method].settingKey] = value ? "on" : "off";
  }
  if (body.maxSessionHours !== undefined) {
    const hours = Number(String(body.maxSessionHours).trim());
    if (!Number.isFinite(hours) || hours <= 0 || hours > 72) throw new HttpError(400, "Maximum session length must be between 0 and 72 hours.");
    values.maxSessionHours = String(hours);
  }
  if (body.appBaseUrl !== undefined) {
    const address = String(body.appBaseUrl).trim().replace(/\/+$/, "");
    if (address) {
      let url: URL | null = null;
      try {
        url = new URL(address);
      } catch {
        url = null;
      }
      if (!url || !/^https?:$/.test(url.protocol) || url.pathname !== "/" || url.search) {
        throw new HttpError(400, "App address must look like http://192.168.1.20:3002 (no path).");
      }
    }
    values.appBaseUrl = address;
  }
  await saveSettings(values);
  await audit(user.id, "SETTINGS_UPDATED", "Setting", "", values);
  return NextResponse.json({ ok: true });
}, canManageMasterData);
