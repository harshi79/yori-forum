export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="h-8 w-24 animate-pulse rounded bg-white/10" />
      <div className="mt-24 h-56 animate-pulse rounded-3xl bg-white/5" />
      <p className="mt-5 text-slate-400">Loading your community…</p>
    </main>
  );
}
