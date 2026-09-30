"use client";
import Link from "next/link";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-28">
      <p className="text-sm uppercase tracking-widest text-violet-300">
        A pause in the conversation
      </p>
      <h1 className="mt-4 text-4xl font-semibold">
        We couldn’t load this page.
      </h1>
      <p className="mt-4 text-slate-400">
        Check your connection and try again. Your work has not been changed.
      </p>
      <div className="mt-8 flex gap-5">
        <button
          onClick={reset}
          className="rounded-xl bg-violet-400 px-5 py-3 font-semibold text-[#151126]"
        >
          Try again
        </button>
        <Link href="/community" className="self-center text-violet-300">
          Browse spaces →
        </Link>
      </div>
    </main>
  );
}
