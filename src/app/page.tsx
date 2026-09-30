import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden px-6 sm:px-10">
      <div className="pointer-events-none absolute -right-40 top-0 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[110px]" />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between border-b border-white/10 py-7">
        <Link
          href="/"
          className="flex items-center gap-3 text-xl font-bold tracking-tight"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-violet-400 text-lg text-[#111020]">
            ✳
          </span>{" "}
          yori<span className="text-violet-400">.</span>
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white/80 transition hover:border-violet-400 hover:text-white"
        >
          Join the community ↗
        </Link>
      </header>
      <section className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center py-24 sm:py-36">
        <div className="mb-9 w-fit rounded-full border border-violet-400/30 bg-violet-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
          A home for what comes next
        </div>
        <h1 className="max-w-4xl text-6xl font-semibold leading-[1.06] tracking-[-0.065em] sm:text-8xl">
          The conversation{" "}
          <span className="text-violet-400">continues here.</span>
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-slate-400">
          Chats move fast. Good ideas deserve a place to stay. Yori is a
          thoughtful space for our community to connect, share, and find each
          other again.
        </p>
        <div className="mt-11 flex flex-wrap items-center gap-5">
          <Link
            href="/community"
            className="rounded-full bg-violet-400 px-7 py-3.5 font-semibold text-[#151126] transition hover:bg-violet-300"
          >
            Enter the community →
          </Link>
          <span className="text-sm text-slate-500">
            A new space is taking shape.
          </span>
        </div>
      </section>
      <footer className="relative mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-4 border-t border-white/10 py-7 text-sm text-slate-500">
        <span>© {new Date().getFullYear()} Yori</span>
        <span>Made for the conversations that matter.</span>
      </footer>
    </main>
  );
}
