import Link from "next/link";
import { requireAuth } from "@/lib/auth/server";
import { syncAuthUser } from "@/lib/auth/sync";

export const dynamic = "force-dynamic";

export default async function Community() {
  const authUser = await requireAuth();
  await syncAuthUser(authUser);
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-12">
      <Link href="/" className="text-violet-300">
        ✳ yori.
      </Link>
      <div className="mt-24 rounded-3xl border border-white/10 bg-white/[0.03] p-10">
        <p className="text-sm uppercase tracking-widest text-violet-300">
          Your space
        </p>
        <h1 className="mt-4 text-4xl font-semibold">
          Welcome to the community.
        </h1>
        <p className="mt-5 text-slate-400">
          Your account is ready. Discussions are coming soon.
        </p>
      </div>
    </main>
  );
}
