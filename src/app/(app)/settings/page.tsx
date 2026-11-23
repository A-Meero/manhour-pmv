import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageSettings } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { loadProviders, toPublic } from "@/lib/ai-providers";
import { mailStatus } from "@/lib/mail";
import { SettingsTabs } from "@/components/settings-tabs";
import { PageHeader } from "@/components/ui";

export default async function SettingsPage() {
  await requirePage(canManageSettings);
  const [settings, providers, fields, keys, shifts] = await Promise.all([
    getSettings(),
    loadProviders(),
    prisma.fieldDefinition.findMany({ orderBy: [{ entity: "asc" }, { sortOrder: "asc" }] }),
    prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } }),
    prisma.shift.findMany({ orderBy: { startTime: "asc" }, include: { _count: { select: { employees: true } } } }),
  ]);
  const mail = mailStatus();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs
        general={{
          dailyHourLimit: settings.dailyHourLimit === null ? "" : String(settings.dailyHourLimit),
          weeklyHourLimit: settings.weeklyHourLimit === null ? "" : String(settings.weeklyHourLimit),
          weekStartDay: String(settings.weekStartDay),
          methods: settings.methods,
          maxSessionHours: String(settings.maxSessionHours),
          appBaseUrl: settings.appBaseUrl,
          shiftAlerts: settings.shiftAlerts,
          shiftGraceMinutes: String(settings.shiftGraceMinutes),
          workshopWords: settings.workshopWords.join(", "),
        }}
        mail={{ label: mail.label, from: mail.from, ready: mail.ready, missing: mail.missing }}
        shifts={shifts.map((shift) => ({
          id: shift.id,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          days: shift.days,
          active: shift.active,
          employees: shift._count.employees,
        }))}
        ocr={{
          providers: providers.map(toPublic),
          tesseractLanguage: settings.tesseractLanguage,
        }}
        fields={fields.map((field) => ({
          id: field.id,
          entity: field.entity,
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required,
          options: field.options,
          active: field.active,
          sortOrder: field.sortOrder,
        }))}
        apiKeys={keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          scopes: key.scopes,
          active: key.active,
          lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
          createdAt: key.createdAt.toISOString(),
          createdBy: key.createdBy?.name ?? "",
        }))}
      />
    </>
  );
}
