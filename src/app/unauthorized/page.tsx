import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-md p-8 text-center">
        <h1 className="text-lg font-bold">No access</h1>
        <p className="mt-2 text-sm text-gray-600">You do not have permission to open this page.</p>
        <Link href="/" className="btn btn-primary mt-6">Back to home</Link>
      </div>
    </main>
  );
}
