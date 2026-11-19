import { canEnterRecords, canManageInventory, canManageMasterData } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { buildTemplate, xlsxResponse, type TemplateKind } from "@/lib/excel";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";

type Ctx = { params: Promise<{ kind: string }> };

const ENTITY = { "job-cards": "JOB_CARD", employees: "EMPLOYEE", records: "RECORD", parts: null } as const;

export const GET = withUser<Ctx>(async (_request, user, { params }) => {
  const { kind } = await params;
  if (!(kind in ENTITY)) throw new HttpError(404, "Unknown template.");
  const templateKind = kind as TemplateKind;
  const allowed =
    templateKind === "records" ? canEnterRecords(user) : templateKind === "parts" ? canManageInventory(user) : canManageMasterData(user);
  if (!allowed) {
    throw new HttpError(403, "You do not have permission to download this template.");
  }
  const entity = ENTITY[templateKind];
  const fields = entity ? toFieldDefs(await getFieldDefinitions(entity)) : [];
  const data = await buildTemplate(templateKind, fields);
  return xlsxResponse(data, `${kind}-import-template.xlsx`);
});
