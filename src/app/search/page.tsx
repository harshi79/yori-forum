import Link from "next/link";
import { getDb } from "@/db/client";
import { optionalActor } from "@/lib/forum/context";
import { search } from "@/lib/forum/extra";
import { pageNumber } from "@/lib/forum/validation";
import { ForumError } from "@/lib/forum/permissions";
import { limit, fingerprint } from "@/lib/forum/rate";
import { headers } from "next/headers";
import {
  Header,
  Shell,
  Empty,
  DateLabel,
  panel,
  input,
} from "@/components/forum";
export const dynamic = "force-dynamic";
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: rawPage } = await searchParams,
    page = pageNumber(rawPage),
    actor = await optionalActor();
  let result: Awaited<ReturnType<typeof search>> | undefined,
    error = "";
  if (q !== undefined) {
    try {
      const db = getDb();
      const ip = (await headers()).get("cf-connecting-ip") ?? "unverified";
      await limit(db, "search", actor?.id ?? `ip:${await fingerprint(ip)}`);
      result = await search(db, q, page);
    } catch (e) {
      error =
        e instanceof ForumError
          ? e.message
          : "Search is unavailable right now.";
    }
  }
  const base = `/search?q=${encodeURIComponent(result?.term ?? "")}`;
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <h1 className="mb-6 text-4xl font-semibold">Find a conversation</h1>
        <form
          action="/search"
          method="get"
          className="mb-10 flex max-w-xl flex-wrap gap-3 sm:flex-nowrap"
        >
          <input
            className={`${input} min-w-0`}
            name="q"
            aria-label="Search conversations"
            defaultValue={q ?? ""}
            minLength={2}
            maxLength={80}
            required
            placeholder="Topics, words or usernames"
          />
          <button className="rounded-xl bg-violet-400 px-5 font-semibold text-[#151126]">
            Search
          </button>
        </form>
        {error && (
          <p role="alert" className="mb-6 text-rose-300">
            {error}
          </p>
        )}
        {result && (
          <>
            <p className="mb-5 text-sm text-slate-400">
              Results for “{result.term}”
            </p>
            <div className="space-y-3">
              {result.rows.length ? (
                result.rows.slice(0, 20).map(({ thread, category, author }) => (
                  <Link
                    key={thread.id}
                    className={`${panel} block hover:border-violet-400/40`}
                    href={`/threads/${thread.id}`}
                  >
                    <p className="text-xs text-violet-300">{category.name}</p>
                    <h2 className="mt-2 break-words text-lg font-semibold">
                      {thread.title}
                    </h2>
                    <p className="mt-2 text-xs text-slate-500">
                      {author?.handle ?? "Former member"} ·{" "}
                      <DateLabel date={thread.lastActivityAt} />
                    </p>
                  </Link>
                ))
              ) : (
                <Empty>No conversations found. Try a different phrase.</Empty>
              )}
            </div>
            <nav className="mt-8 flex justify-center gap-4 text-sm">
              {page > 1 && (
                <Link
                  className="text-violet-300"
                  href={`${base}&page=${page - 1}`}
                >
                  ← Previous
                </Link>
              )}
              <span>Page {page}</span>
              {result.rows.length > 20 && (
                <Link
                  className="text-violet-300"
                  href={`${base}&page=${page + 1}`}
                >
                  Next →
                </Link>
              )}
            </nav>
          </>
        )}
      </Shell>
    </>
  );
}
