import { NextResponse } from "next/server";
import { canManageAssets } from "@/lib/auth/access";
import { readJson, withUser } from "@/lib/http";
import { createAsset, type AssetBody } from "@/lib/assets";
import { audit } from "@/lib/audit";

export const POST = withUser(async (request, user) => {
  const asset = await createAsset(await readJson<AssetBody>(request));
  await audit(user.id, "ASSET_CREATED", "Asset", asset.id, { code: asset.code });
  return NextResponse.json({ id: asset.id, code: asset.code });
}, canManageAssets);
