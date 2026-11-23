import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guards";
import { canBrowseJobCards, canManageAssets, canViewAssets, canViewCosts } from "@/lib/auth/access";
import { assetCosts, bookValue } from "@/lib/assets";
import { toAssetForm } from "@/lib/asset-view";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { AssetEditButton } from "@/components/asset-edit-button";
import { ColumnChart } from "@/components/charts";
import { PageHeader, StatusBadge } from "@/components/ui";
import { QrCard } from "@/components/qr-card";
import { appOrigin, assetLink, qrDataUrl } from "@/lib/qr";
import { REPAIR_TYPE_LABEL } from "@/lib/repair-type";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
const reading = (value: { toString(): string } | null) => (value === null ? "" : Number(value).toLocaleString("en-US"));

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage(canViewAssets);
  const { id } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: { jobCards: { orderBy: [{ dateIn: "desc" }, { createdAt: "desc" }] } },
  });
  if (!asset) notFound();
  const showCosts = canViewCosts(user);
  const qr = await qrDataUrl(assetLink(await appOrigin(), asset.code), 320);
  const linkCards = canBrowseJobCards(user);
  const costs = showCosts ? await assetCosts([asset.id]) : null;
  const totals = costs?.byAsset.get(asset.id) ?? { labour: 0, parts: 0, total: 0 };
  const months = costs ? Array.from(costs.byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)) : [];
  const years = new Map<string, { labour: number; parts: number; total: number }>();
  for (const [key, value] of months) {
    const year = years.get(key.slice(0, 4)) ?? { labour: 0, parts: 0, total: 0 };
    year.labour += value.labour;
    year.parts += value.parts;
    year.total += value.total;
    years.set(key.slice(0, 4), year);
  }
  const book = bookValue(asset);
  const open = asset.jobCards.filter((card) => card.status === "OPEN" && card.active);

  const detail = (label: string, value: React.ReactNode) =>
    value ? (
      <div>
        <dt className="text-xs text-gray-500">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    ) : null;

  return (
    <>
      <PageHeader
        title={`${asset.code} ${asset.description ? `– ${asset.description}` : ""}`}
        description={[asset.category, asset.location].filter(Boolean).join(" · ") || undefined}
        actions={canManageAssets(user) ? <AssetEditButton asset={toAssetForm(asset)} showCosts={showCosts} /> : undefined}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {detail("Plate no.", asset.plateNo && <span className="font-mono">{asset.plateNo}</span>)}
            {detail("Chassis no.", asset.chassisNo && <span className="font-mono">{asset.chassisNo}</span>)}
            {detail("Serial no.", asset.serialNo)}
            {detail("Make", asset.make)}
            {detail("Model", asset.model)}
            {detail("Year of make", asset.yearOfMake)}
            {detail("Job cards", asset.jobCards.length)}
            {detail(
              "Open job card",
              open.length ? (
                open.map((card) => (
                  <Link key={card.id} href={`/job-cards/${card.id}`} className="mr-2 text-brand hover:underline">{card.code}</Link>
                ))
              ) : (
                <span className="text-gray-500">None</span>
              ),
            )}
            <div>
              <dt className="text-xs text-gray-500">Status</dt>
              <dd><StatusBadge active={asset.active} /></dd>
            </div>
          </dl>
          {asset.notes && <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{asset.notes}</p>}
        </div>

        <div className="lg:order-last lg:col-span-3">
          <QrCard
            dataUrl={qr}
            alt={`QR code for asset ${asset.code}`}
            caption="Stick this on the vehicle or equipment. Scanning it opens this page; on the Add Job Card form (Type it in) it fills in the asset."
            labelHref={`/api/templates/asset-labels?ids=${asset.id}`}
            downloadName={`asset-${asset.code}-qr.png`}
          />
        </div>

        {showCosts && (
          <div className="card space-y-2 p-4 text-sm">
            <h2 className="font-semibold">Value &amp; cost</h2>
            <Row label="Purchase value" value={asset.purchaseValue === null ? "—" : formatMoney(Number(asset.purchaseValue))} />
            <Row label="Purchase date" value={asset.purchaseDate ? formatDate(asset.purchaseDate) : "—"} />
            <Row label="Depreciation" value={asset.depreciationRate === null ? "—" : `${Number(asset.depreciationRate)}% / year (straight line)`} />
            <Row label="Book value today" value={book === null ? "—" : formatMoney(book)} strong />
            <hr className="border-gray-100" />
            <Row label="Maintenance labour" value={formatMoney(totals.labour)} />
            <Row label="Maintenance parts" value={formatMoney(totals.parts)} />
            <Row label="Total maintenance" value={formatMoney(totals.total)} strong />
          </div>
        )}
      </div>

      {showCosts && months.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="card p-4 lg:col-span-2">
            <h2 className="mb-2 font-semibold">Maintenance cost per month</h2>
            <ColumnChart unit=" KWD" data={months.map(([key, v]) => ({ label: monthLabel(key), detail: `Labour ${formatMoney(v.labour)} · Parts ${formatMoney(v.parts)}`, value: v.total }))} />
          </div>
          <div className="card p-4">
            <h2 className="mb-2 font-semibold">Per year</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="text-right">Labour</th>
                  <th className="text-right">Parts</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(years.entries()).sort(([a], [b]) => b.localeCompare(a)).map(([year, v]) => (
                  <tr key={year}>
                    <td>{year}</td>
                    <td className="text-right">{formatMoney(v.labour, false)}</td>
                    <td className="text-right">{formatMoney(v.parts, false)}</td>
                    <td className="text-right font-semibold">{formatMoney(v.total, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-brand">Per month</summary>
              <table className="table mt-2">
                <tbody>
                  {months.slice().reverse().map(([key, v]) => (
                    <tr key={key}>
                      <td>{monthLabel(key)}</td>
                      <td className="text-right">{formatMoney(v.total, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </div>
      )}

      <div className="mt-4">
        <h2 className="mb-2 font-semibold">Job card history</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Job card</th>
                <th>Date in</th>
                <th>Date out</th>
                <th>Type</th>
                <th>Job type</th>
                <th>Project</th>
                <th className="text-right">Prev. HM/KM</th>
                <th className="text-right">HM/KM</th>
                <th>Status</th>
                {showCosts && <th className="text-right">Hours</th>}
                {showCosts && <th className="text-right">Labour</th>}
                {showCosts && <th className="text-right">Parts</th>}
                {showCosts && <th className="text-right">Total</th>}
              </tr>
            </thead>
            <tbody>
              {asset.jobCards.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-gray-500">No job cards for this asset yet.</td>
                </tr>
              )}
              {asset.jobCards.map((card) => {
                const cost = costs?.byCard.get(card.id);
                return (
                  <tr key={card.id}>
                    <td className="font-mono font-semibold">
                      {linkCards ? <Link href={`/job-cards/${card.id}`} className="text-brand hover:underline">{card.code}</Link> : card.code}
                    </td>
                    <td>{formatDate(card.dateIn)}</td>
                    <td>{formatDate(card.dateOut ?? card.closedAt)}</td>
                    <td>{card.repairType ? REPAIR_TYPE_LABEL[card.repairType] : ""}</td>
                    <td>{card.jobType}</td>
                    <td>{card.project}</td>
                    <td className="text-right">{reading(card.previousReading)}</td>
                    <td className="text-right">{reading(card.currentReading)}</td>
                    <td>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${card.status === "OPEN" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                        {card.status === "OPEN" ? "Open" : "Closed"}
                      </span>
                    </td>
                    {showCosts && <td className="text-right">{cost?.hours ?? 0}</td>}
                    {showCosts && <td className="text-right">{formatMoney(cost?.labour ?? 0, false)}</td>}
                    {showCosts && <td className="text-right">{formatMoney(cost?.parts ?? 0, false)}</td>}
                    {showCosts && <td className="text-right font-semibold">{formatMoney(cost?.total ?? 0, false)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
