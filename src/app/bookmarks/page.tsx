import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { bookmarks, threads, categories } from "@/db/schema";
import { currentActor } from "@/lib/forum/context";
import { pageNumber } from "@/lib/forum/validation";
import {
  Header,
  Shell,
  Empty,
  Pagination,
  DateLabel,
  panel,
} from "@/components/forum";
export const dynamic = "force-dynamic";
export default async function BookmarksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await currentActor(),
    page = pageNumber((await searchParams).page);
  const list = await getDb()
    .select({ bookmark: bookmarks, thread: threads, category: categories })
    .from(bookmarks)
    .innerJoin(threads, eq(bookmarks.threadId, threads.id))
    .innerJoin(categories, eq(threads.categoryId, categories.id))
    .where(
      and(
        eq(bookmarks.userId, actor.id),
        isNull(threads.deletedAt),
        isNull(threads.archivedAt),
        isNull(categories.archivedAt),
      ),
    )
    .orderBy(desc(bookmarks.createdAt), desc(threads.createdAt))
    .limit(21)
    .offset((page - 1) * 20);
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <h1 className="mb-9 text-4xl font-semibold">Saved conversations</h1>
        <div className="space-y-3">
          {list.length ? (
            list.slice(0, 20).map((row) => (
              <Link
                className={`${panel} block hover:border-violet-400/40`}
                key={row.thread.id}
                href={`/threads/${row.thread.id}`}
              >
                <p className="text-xs text-violet-300">{row.category.name}</p>
                <h2 className="mt-2 text-lg font-semibold">
                  {row.thread.title}
                </h2>
                <p className="mt-2 text-xs text-slate-500">
                  Saved <DateLabel date={row.bookmark.createdAt} />
                </p>
              </Link>
            ))
          ) : (
            <Empty>
              No saved conversations yet. Bookmark a thread to find it here.
            </Empty>
          )}
        </div>
        <Pagination page={page} hasMore={list.length > 20} base="/bookmarks" />
      </Shell>
    </>
  );
}
