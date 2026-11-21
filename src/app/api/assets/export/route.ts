import { prisma } from "@/lib/prisma";
import { canViewAssets, canViewCosts } from "@/lib/auth/access";
import { withUser } from "@/lib/http";
import { buildSheet, xlsxResponse } from "@/lib/excel";
import { assetCosts, bookValue } from "@/lib/assets";
import { toIsoDate } from "@/lib/dates";

export const GET = withUser(async (_request, user) => {
  const assets = await prisma.asset.findMany({ orderBy: { code: "asc" } });
  const costs = canViewCosts(user);
  const totals = costs ? (await assetCosts(assets.map((a) => a.id))).byAsset : null;
  const columns = [
    { header: "Asset Code", key: "code", width: 14 },
    { header: "Description", key: "description", width: 34 },
    { header: "Category", key: "category" },
    { header: "Location / Department", key: "location", width: 22 },
    { header: "Make", key: "make" },
    { header: "Model", key: "model" },
    { header: "Serial No.", key: "serialNo" },
    { header: "Chassis No.", key: "chassisNo", width: 22 },
    { header: "Plate No.", key: "plateNo" },
    { header: "Year of Make", key: "yearOfMake", width: 12 },
    { header: "Active", key: "active", width: 8 },
    ...(costs
      ? [
          { header: "Purchase Date", key: "purchaseDate", date: true },
          { header: "Purchase Value", key: "purchaseValue" },
          { header: "Depreciation Rate %", key: "depreciationRate" },
          { header: "Book Value Today", key: "bookValue" },
          { header: "Maintenance Labour", key: "labour" },
          { header: "Maintenance Parts", key: "parts" },
          { header: "Maintenance Total", key: "total" },
        ]
      : []),
  ];
  const rows = assets.map((a) => ({
    ...a,
    active: a.active ? "Yes" : "No",
    purchaseDate: a.purchaseDate ? new Date(toIsoDate(a.purchaseDate)) : null,
    purchaseValue: a.purchaseValue === null ? null : Number(a.purchaseValue),
    depreciationRate: a.depreciationRate === null ? null : Number(a.depreciationRate),
    bookValue: bookValue(a),
    labour: totals?.get(a.id)?.labour ?? 0,
    parts: totals?.get(a.id)?.parts ?? 0,
    total: totals?.get(a.id)?.total ?? 0,
  }));
  return xlsxResponse(await buildSheet("Assets", columns, rows), "assets.xlsx");
}, canViewAssets);
