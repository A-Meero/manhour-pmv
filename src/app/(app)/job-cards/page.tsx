import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canBrowseJobCards, canManageMasterData } from "@/lib/auth/access";
import { getFieldDefinitions, toFieldDefs } from "@/lib/fields";
import { JobCardsManager } from "@/components/job-cards-manager";
import { PageHeader, Pagination } from "@/components/ui";
import type { ClientField } from "@/components/custom-field-inputs";

const PAGE_SIZE = 50;

export default async function JobCardsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage(canBrowseJobCards);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const status = params.status ?? "all";
  const page = Math.max(1, Number(params.page) || 1);
  const where = {
    ...(q ? { code: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status === "active" ? { active: true } : status === "inactive" ? { active: false } : {}),
    ...(status === "open" ? { status: "OPEN" as const, active: true } : status === "closed" ? { status: "CLOSED" as const } : {}),
  };
  const [total, cards, fields] = await Promise.all([
    prisma.jobCard.count({ where }),
    prisma.jobCard.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { records: true, workSessions: true, stockMovements: true } } },
    }),
    getFieldDefinitions("JOB_CARD"),
  ]);

  return (
    <>
      <PageHeader
        title="Job Cards"
        description="Job card IDs that man-hour records can be booked against. Each ID is unique. Open a card for its QR code, work sessions, parts and cost."
      />
      <JobCardsManager
        canManage={canManageMasterData(user)}
        fields={toFieldDefs(fields) as ClientField[]}
        filters={{ q, status }}
        cards={cards.map((card) => ({
          id: card.id,
          code: card.code,
          active: card.active,
          status: card.status,
          closedAt: card.closedAt?.toISOString() ?? null,
          source: card.source,
          customFields: card.customFields as Record<string, string | number | boolean | null>,
          records: card._count.records,
          inUse: card._count.records + card._count.workSessions + card._count.stockMovements,
          createdAt: card.createdAt.toISOString(),
        }))}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/job-cards" params={{ q, status }} />
    </>
  );
}
