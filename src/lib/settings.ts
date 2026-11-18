import "server-only";

import { prisma } from "@/lib/prisma";

export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";

export type AppSettings = {
  /** null = no limit */
  dailyHourLimit: number | null;
  weeklyHourLimit: number | null;
  /** 0=Sunday … 6=Saturday */
  weekStartDay: number;
  claudeApiKey: string;
  claudeModel: string;
  /** Tesseract language code(s), e.g. "eng" */
  tesseractLanguage: string;
};

const DEFAULTS: Record<keyof AppSettings, string> = {
  dailyHourLimit: "",
  weeklyHourLimit: "",
  weekStartDay: "6",
  claudeApiKey: "",
  claudeModel: DEFAULT_CLAUDE_MODEL,
  tesseractLanguage: "eng",
};

function toLimit(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = { ...DEFAULTS } as Record<string, string>;
  for (const row of rows) map[row.key] = row.value;
  const weekStartDay = Number(map.weekStartDay);
  return {
    dailyHourLimit: toLimit(map.dailyHourLimit),
    weeklyHourLimit: toLimit(map.weeklyHourLimit),
    weekStartDay: Number.isInteger(weekStartDay) && weekStartDay >= 0 && weekStartDay <= 6 ? weekStartDay : 6,
    claudeApiKey: map.claudeApiKey,
    claudeModel: map.claudeModel || DEFAULT_CLAUDE_MODEL,
    tesseractLanguage: map.tesseractLanguage || "eng",
  };
}

export async function saveSettings(values: Partial<Record<keyof AppSettings, string>>) {
  const entries = Object.entries(values).filter(([key]) => key in DEFAULTS) as [string, string][];
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
}
