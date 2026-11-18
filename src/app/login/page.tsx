import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <Image src="/ahmadiah-logo.png" alt="Ahmadiah Contracting & Trading Co." width={1218} height={204} className="mx-auto h-auto w-full max-w-xs" priority />
        <h1 className="mt-6 text-center text-lg font-bold text-gray-900">Man Hour System</h1>
        <p className="mb-6 text-center text-sm text-gray-500">Sign in to continue</p>
        <LoginForm />
      </div>
    </main>
  );
}
