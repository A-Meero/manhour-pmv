import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canEditJobCards } from "@/lib/auth/access";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import { toIsoDate } from "@/lib/dates";
import { JobCardForm } from "@/components/job-card-form";
import { PageHeader } from "@/components/ui";
import type { ClientField, FieldValues } from "@/components/custom-field-inputs";

export default async function EditJobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage(canEditJobCards);
  const { id } = await params;
  const [card, fields] = await Promise.all([
    prisma.jobCard.findUnique({ where: { id }, include: { asset: true, tasks: { orderBy: { line: "asc" } } } }),
    getFieldDefinitions("JOB_CARD"),
  ]);
  if (!card) notFound();
  const reading = (value: { toString(): string } | null) => (value === null ? "" : String(Number(value)));
  return (
    <>
      <PageHeader title={`Edit job card ${card.code}`} description="Correct the details taken from the printed card, or link a different asset." />
      <JobCardForm
        mode="edit"
        jobCardId={card.id}
        cardStatus={card.status}
        isAdmin={user.isAdmin}
        fields={toFieldDefs(fields) as ClientField[]}
        initial={{
          code: card.code,
          assetId: card.assetId ?? "",
          assetCode: card.asset?.code ?? "",
          description: card.asset?.description ?? "",
          plateNo: card.asset?.plateNo ?? "",
          chassisNo: card.asset?.chassisNo ?? "",
          yearOfMake: card.asset?.yearOfMake ? String(card.asset.yearOfMake) : "",
          previousReading: reading(card.previousReading),
          currentReading: reading(card.currentReading),
          dateIn: toIsoDate(card.dateIn),
          dateOut: toIsoDate(card.dateOut),
          jobType: card.jobType,
          repairAt: card.repairAt,
          project: card.project,
          operatorName: card.operatorName,
          receivedBy: card.receivedBy,
          createdByName: card.createdByName,
          tasks: card.tasks.map((task) => ({ description: task.description, fromDate: toIsoDate(task.fromDate) })),
          customFields: card.customFields as FieldValues,
        }}
      />
    </>
  );
}
