import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { safeNext } from "@/lib/safe-next";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <Image src="/ahmadiah-logo.png" alt="Ahmadiah Contracting & Trading Co." width={1218} height={204} className="mx-auto h-auto w-full max-w-xs" priority />
        <h1 className="mt-6 text-center text-lg font-bold text-gray-900">Man Hour System</h1>
        <p className="mb-6 text-center text-sm text-gray-500">Sign in to continue</p>
        {next.startsWith("/jc/") && (
          <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-center text-sm text-blue-800">Sign in to record your work on this job card.</p>
        )}
        <LoginForm next={next} />
      </div>
    </main>
  );
}
