import "server-only";

import { prisma } from "@/lib/prisma";
import type { LoggingMethod } from "@/lib/logging-methods";

export type AppSettings = {
  /** null = no limit */
  dailyHourLimit: number | null;
  weeklyHourLimit: number | null;
  /** 0=Sunday … 6=Saturday */
  weekStartDay: number;
  /** AI providers for photo reading are stored separately: see src/lib/ai-providers.ts */
  /** Tesseract language code(s), e.g. "eng" */
  tesseractLanguage: string;
  /** Which ways of logging man-hours are switched on (admins can always use all of them) */
  methods: Record<LoggingMethod, boolean>;
  /** QR sessions still running after this many hours are stopped automatically and flagged for review */
  maxSessionHours: number;
  /** Address phones use to reach the app, used in the job card QR codes, e.g. "http://192.168.1.20:3002". "" = the request's host */
  appBaseUrl: string;
};

const DEFAULTS = {
  dailyHourLimit: "",
  weeklyHourLimit: "",
  weekStartDay: "6",
  tesseractLanguage: "eng",
  methodManual: "on",
  methodExcel: "on",
  methodPhoto: "on",
  methodQr: "on",
  maxSessionHours: "12",
  appBaseUrl: "",
};

export type SettingKey = keyof typeof DEFAULTS;

function toLimit(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: Object.keys(DEFAULTS) } } });
  const map = { ...DEFAULTS } as Record<string, string>;
  for (const row of rows) map[row.key] = row.value;
  const weekStartDay = Number(map.weekStartDay);
  const maxSessionHours = Number(map.maxSessionHours);
  return {
    dailyHourLimit: toLimit(map.dailyHourLimit),
    weeklyHourLimit: toLimit(map.weeklyHourLimit),
    weekStartDay: Number.isInteger(weekStartDay) && weekStartDay >= 0 && weekStartDay <= 6 ? weekStartDay : 6,
    tesseractLanguage: map.tesseractLanguage || "eng",
    methods: {
      manual: map.methodManual !== "off",
      excel: map.methodExcel !== "off",
      photo: map.methodPhoto !== "off",
      qr: map.methodQr !== "off",
    },
    maxSessionHours: Number.isFinite(maxSessionHours) && maxSessionHours > 0 && maxSessionHours <= 72 ? maxSessionHours : 12,
    appBaseUrl: map.appBaseUrl.trim().replace(/\/+$/, ""),
  };
}

export async function saveSettings(values: Partial<Record<SettingKey, string>>) {
  const entries = Object.entries(values).filter(([key]) => key in DEFAULTS) as [string, string][];
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
}
