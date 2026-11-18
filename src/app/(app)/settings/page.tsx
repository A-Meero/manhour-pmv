import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageMasterData } from "@/lib/auth/access";
import { getSettings } from "@/lib/settings";
import { SettingsTabs } from "@/components/settings-tabs";
import { PageHeader } from "@/components/ui";

export default async function SettingsPage() {
  await requirePage(canManageMasterData);
  const [settings, fields, keys] = await Promise.all([
    getSettings(),
    prisma.fieldDefinition.findMany({ orderBy: [{ entity: "asc" }, { sortOrder: "asc" }] }),
    prisma.apiKey.findMany({ orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs
        general={{
          dailyHourLimit: settings.dailyHourLimit === null ? "" : String(settings.dailyHourLimit),
          weeklyHourLimit: settings.weeklyHourLimit === null ? "" : String(settings.weeklyHourLimit),
          weekStartDay: String(settings.weekStartDay),
        }}
        ocr={{
          hasClaudeKey: !!settings.claudeApiKey,
          claudeKeyHint: settings.claudeApiKey ? `…${settings.claudeApiKey.slice(-4)}` : "",
          claudeModel: settings.claudeModel,
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
