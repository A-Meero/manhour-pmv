import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageInventory } from "@/lib/auth/access";
import { partRequestInclude, toClientRequest } from "@/lib/part-requests";
import { REPAIR_TYPE_LABEL } from "@/lib/repair-type";
import { PageHeader } from "@/components/ui";
import { RequestItem } from "@/components/part-requests-panel";

export const dynamic = "force-dynamic";

/** Store managers: spare part requests from all job cards, oldest open first. */
export default async function PartRequestsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requirePage(canManageInventory);
  const { show = "open" } = await searchParams;
  const requests = await prisma.partRequest.findMany({
    where: show === "fulfilled" ? { status: "FULFILLED" } : show === "all" ? {} : { status: { not: "FULFILLED" } },
    include: {
      ...partRequestInclude,
      jobCard: { select: { id: true, code: true, status: true, repairType: true, asset: { select: { code: true, description: true } } } },
    },
    orderBy: show === "open" ? { createdAt: "asc" } : { createdAt: "desc" },
    take: 500,
  });
  const tabs = [
    ["open", "Open & MR raised"],
    ["fulfilled", "Fulfilled"],
    ["all", "All"],
  ] as const;

  return (
    <>
      <PageHeader
        title="Part Requests"
        description="Spare parts asked for on job cards. Issue what is in stock from the job card (Spare parts, or Add items by QR code); mark MR raised for what has to be bought; mark fulfilled once everything was issued."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/part-requests?show=${key}`} className={`btn btn-sm ${show === key ? "btn-primary" : ""}`}>
            {label}
          </Link>
        ))}
      </div>
      {requests.length === 0 && <p className="card p-6 text-center text-sm text-gray-500">No requests here.</p>}
      <div className="space-y-3">
        {requests.map((request) => (
          <div key={request.id} className="space-y-2">
            <p className="text-sm">
              <Link href={`/job-cards/${request.jobCard.id}#part-requests`} className="font-mono font-semibold text-brand hover:underline">
                {request.jobCard.code}
              </Link>
              {request.jobCard.asset && (
                <span className="text-gray-700">
                  {" "}· <span className="font-mono">{request.jobCard.asset.code}</span> {request.jobCard.asset.description}
                </span>
              )}
              {request.jobCard.repairType && <span className="text-gray-500"> · {REPAIR_TYPE_LABEL[request.jobCard.repairType]}</span>}
              {request.jobCard.status === "CLOSED" && <span className="text-red-700"> · card closed</span>}
            </p>
            <RequestItem request={toClientRequest(request)} isStore />
          </div>
        ))}
      </div>
    </>
  );
}
