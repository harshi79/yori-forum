import Link from "next/link";
import type { Actor } from "@/lib/forum/permissions";
export const panel =
  "rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-7";
export const input =
  "w-full rounded-xl border border-white/15 bg-[#131524] px-4 py-3 text-white outline-none focus:border-violet-400";
export const button =
  "rounded-xl bg-violet-400 px-5 py-2.5 font-semibold text-[#171226] hover:bg-violet-300 disabled:opacity-50";
export function Header({ actor }: { actor?: Actor | null }) {
  return (
    <header className="border-b border-white/10">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
        <Link href="/community" className="text-xl font-bold">
          ✳ yori<span className="text-violet-400">.</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-slate-300">
          <Link href="/community" className="hover:text-white">
            Explore
          </Link>
          {actor && (
            <Link href="/profile" className="hover:text-white">
              My profile
            </Link>
          )}
          {actor?.role !== "user" && actor && (
            <Link href="/moderation">Reports</Link>
          )}
          {actor?.role === "admin" && <Link href="/admin">Manage</Link>}
          {!actor && (
            <Link href="/login" className="text-violet-300">
              Sign in →
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:py-14">{children}</main>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${panel} py-14 text-center text-slate-400`}>
      {children}
    </div>
  );
}
export function Pagination({
  page,
  hasMore,
  base,
}: {
  page: number;
  hasMore: boolean;
  base: string;
}) {
  return (
    <nav
      aria-label="Pages"
      className="mt-8 flex items-center justify-center gap-4 text-sm"
    >
      {page > 1 && (
        <Link className="text-violet-300" href={`${base}?page=${page - 1}`}>
          ← Previous
        </Link>
      )}
      <span className="text-slate-400">Page {page}</span>
      {hasMore && (
        <Link className="text-violet-300" href={`${base}?page=${page + 1}`}>
          Next →
        </Link>
      )}
    </nav>
  );
}
export function DateLabel({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleDateString("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })}
    </time>
  );
}
