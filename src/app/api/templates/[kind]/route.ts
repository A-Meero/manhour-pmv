import { canEnterRecords, canManageMasterData } from "@/lib/auth/access";
import { HttpError, withUser } from "@/lib/http";
import { buildTemplate, xlsxResponse, type TemplateKind } from "@/lib/excel";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";

type Ctx = { params: Promise<{ kind: string }> };

const ENTITY = { "job-cards": "JOB_CARD", employees: "EMPLOYEE", records: "RECORD" } as const;

export const GET = withUser<Ctx>(async (_request, user, { params }) => {
  const { kind } = await params;
  if (!(kind in ENTITY)) throw new HttpError(404, "Unknown template.");
  const templateKind = kind as TemplateKind;
  if (templateKind === "records" ? !canEnterRecords(user) : !canManageMasterData(user)) {
    throw new HttpError(403, "You do not have permission to download this template.");
  }
  const fields = toFieldDefs(await getFieldDefinitions(ENTITY[templateKind]));
  const data = await buildTemplate(templateKind, fields);
  return xlsxResponse(data, `${kind}-import-template.xlsx`);
});
