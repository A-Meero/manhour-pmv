"use client";

import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/import-panel";

export function RecordsImport() {
  const router = useRouter();
  return <ImportPanel endpoint="/api/records/import" templateUrl="/api/templates/records" onImported={() => router.refresh()} />;
}
