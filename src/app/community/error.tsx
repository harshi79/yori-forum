"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-24">
      <h1 className="text-3xl font-semibold">We couldn’t load your space.</h1>
      <p className="mt-3 text-slate-400">Please try again in a moment.</p>
      <button
        onClick={reset}
        className="mt-8 rounded-xl bg-violet-400 px-5 py-3 font-semibold text-[#151126]"
      >
        Try again
      </button>
    </main>
  );
}
