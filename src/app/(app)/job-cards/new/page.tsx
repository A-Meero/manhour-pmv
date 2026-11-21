import { requirePage } from "@/lib/auth/guards";
import { canAddJobCards } from "@/lib/auth/access";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import { JobCardNew } from "@/components/job-card-new";
import { PageHeader } from "@/components/ui";
import type { ClientField } from "@/components/custom-field-inputs";

export default async function NewJobCardPage() {
  const user = await requirePage(canAddJobCards);
  const fields = toFieldDefs(await getFieldDefinitions("JOB_CARD"));
  return (
    <>
      <PageHeader
        title="Add Job Card"
        description="Photograph the printed job card: its details are read for you to check. The job card number must be new, and the asset must not already have an open job card."
      />
      <JobCardNew fields={fields as ClientField[]} isAdmin={user.isAdmin} />
    </>
  );
}
