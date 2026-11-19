import Link from "next/link";

export default async function UnauthorizedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-lg font-bold">{reason === "method" ? "Switched off" : "No access"}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {reason === "method"
            ? "This way of logging man-hours has been switched off by the administrator."
            : "You do not have permission to open this page."}
        </p>
        <Link href="/" className="btn btn-primary mt-6">Back to home</Link>
      </div>
    </main>
  );
}
