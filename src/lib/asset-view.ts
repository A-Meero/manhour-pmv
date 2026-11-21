import "server-only";

import type { Asset } from "@prisma/client";
import { toIsoDate } from "@/lib/dates";

/** Asset as the client forms expect it (numbers and YYYY-MM-DD dates). */
export const toAssetForm = (asset: Asset) => ({
  id: asset.id,
  code: asset.code,
  description: asset.description,
  category: asset.category,
  location: asset.location,
  make: asset.make,
  model: asset.model,
  serialNo: asset.serialNo,
  chassisNo: asset.chassisNo,
  plateNo: asset.plateNo,
  yearOfMake: asset.yearOfMake,
  purchaseDate: toIsoDate(asset.purchaseDate),
  purchaseValue: asset.purchaseValue === null ? null : Number(asset.purchaseValue),
  depreciationRate: asset.depreciationRate === null ? null : Number(asset.depreciationRate),
  notes: asset.notes,
  active: asset.active,
});
