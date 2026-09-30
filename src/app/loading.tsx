export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl animate-pulse px-5 py-14">
      <div className="h-10 w-72 rounded-xl bg-white/10" />
      <div className="mt-8 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/5" />
        ))}
      </div>
      <p className="mt-5 text-sm text-slate-400">Loading conversations…</p>
    </main>
  );
}
