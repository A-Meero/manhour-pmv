"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { AssetFormModal, type AssetForm } from "@/components/assets-manager";

export function AssetEditButton({ asset, showCosts }: { asset: AssetForm; showCosts: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Edit asset
      </button>
      {open && <AssetFormModal asset={asset} showCosts={showCosts} onClose={() => setOpen(false)} onSaved={() => router.refresh()} />}
    </>
  );
}
