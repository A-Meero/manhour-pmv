import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canManageAssets, canViewAssets, canViewCosts } from "@/lib/auth/access";
import { assetCosts, bookValue } from "@/lib/assets";
import { toAssetForm } from "@/lib/asset-view";
import { AssetsManager } from "@/components/assets-manager";
import { PageHeader, Pagination } from "@/components/ui";

const PAGE_SIZE = 50;

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage(canViewAssets);
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const category = params.category ?? "";
  const location = params.location ?? "";
  const show = params.show ?? "active";
  const page = Math.max(1, Number(params.page) || 1);
  const ident = q.replace(/\s+/g, "").toUpperCase();
  const where: Prisma.AssetWhereInput = {
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { plateNo: { contains: ident } },
            { chassisNo: { contains: ident } },
            { serialNo: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(category ? { category } : {}),
    ...(location ? { location } : {}),
    ...(show === "active" ? { active: true } : show === "open" ? { jobCards: { some: { status: "OPEN", active: true } } } : {}),
  };
  const showCosts = canViewCosts(user);
  const [total, assets, categories, locations] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        _count: { select: { jobCards: true } },
        jobCards: { where: { status: "OPEN", active: true }, select: { id: true, code: true }, take: 1, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.asset.findMany({ where: { category: { not: "" } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
    prisma.asset.findMany({ where: { location: { not: "" } }, distinct: ["location"], select: { location: true }, orderBy: { location: "asc" } }),
  ]);
  const costs = showCosts ? (await assetCosts(assets.map((a) => a.id))).byAsset : null;

  return (
    <>
      <PageHeader
        title="Assets"
        description="Vehicles and equipment. Job cards are linked to their asset by the code printed on the card (or the plate / chassis no.). Open an asset for its job card history and costs."
      />
      <AssetsManager
        canManage={canManageAssets(user)}
        showCosts={showCosts}
        filters={{ q, category, location, show }}
        categories={categories.map((c) => c.category)}
        locations={locations.map((l) => l.location)}
        assets={assets.map((asset) => ({
          ...toAssetForm(asset),
          openJobCard: asset.jobCards[0] ?? null,
          jobCards: asset._count.jobCards,
          maintenance: costs ? (costs.get(asset.id)?.total ?? 0) : null,
          bookValue: showCosts ? bookValue(asset) : null,
          ...(showCosts ? {} : { purchaseValue: null, depreciationRate: null, purchaseDate: "" }),
        }))}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/assets" params={{ q, category, location, show }} />
    </>
  );
}
