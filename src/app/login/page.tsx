import Link from "next/link";
import { LoginForm } from "./login-form";

export default function Login() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl sm:p-10">
        <Link href="/" className="text-sm text-violet-300">
          ← Back to Yori
        </Link>
        <h1 className="mt-10 text-3xl font-semibold tracking-tight">
          Come on in.
        </h1>
        <p className="mt-3 text-slate-400">
          Sign in with a magic link. No password to remember.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
