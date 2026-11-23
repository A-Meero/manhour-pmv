import Image from "next/image";
import Link from "next/link";
import { Alert } from "@/components/ui";

/** Plain page for a scanned QR that can't be opened (unknown code, no access). */
export function QrLandingMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-4">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/ahmadiah-a.png" alt="" width={32} height={32} className="h-8 w-8" />
        <span className="text-sm font-semibold text-gray-700">Man Hour System</span>
      </Link>
      <Alert>{children}</Alert>
      <Link className="btn" href="/scan">Scan another QR</Link>
    </main>
  );
}
