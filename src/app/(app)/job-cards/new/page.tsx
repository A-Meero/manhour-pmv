import { requirePage } from "@/lib/auth/guards";
import { canAddByPhoto, canAddJobCards, canAddTyped } from "@/lib/auth/access";
import { jobCardFormOptions } from "@/lib/job-card-form-options";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import { JobCardNew } from "@/components/job-card-new";
import { PageHeader } from "@/components/ui";
import type { ClientField } from "@/components/custom-field-inputs";

export default async function NewJobCardPage() {
  const user = await requirePage(canAddJobCards);
  const [fields, options] = await Promise.all([getFieldDefinitions("JOB_CARD").then(toFieldDefs), jobCardFormOptions(user)]);
  const canPhoto = canAddByPhoto(user);
  return (
    <>
      <PageHeader
        title="Add Job Card"
        description={`${canPhoto ? "Photograph the printed job card or upload its PDF: its details are read for you to check." : "Type in the details of the printed job card."} The job card number must be new, and the asset must not already have an open job card.`}
      />
      <JobCardNew fields={fields as ClientField[]} isAdmin={user.isAdmin} options={options} canPhoto={canPhoto} canType={canAddTyped(user)} />
    </>
  );
}
