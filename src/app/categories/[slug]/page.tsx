import Link from "next/link";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { categories, threads, users } from "@/db/schema";
import { optionalActor } from "@/lib/forum/context";
import { pageNumber } from "@/lib/forum/validation";
import {
  Header,
  Shell,
  Empty,
  Pagination,
  DateLabel,
  panel,
} from "@/components/forum";
import { ThreadForm } from "@/components/forms";
const LIMIT = 20;
export const dynamic = "force-dynamic";
export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params,
    page = pageNumber((await searchParams).page),
    db = getDb();
  const category = await db.query.categories.findFirst({
    where: and(eq(categories.slug, slug), isNull(categories.archivedAt)),
  });
  if (!category) notFound();
  const actor = await optionalActor();
  const list = await db
    .select({
      thread: threads,
      author: users,
      replies: sql<number>`(select count(*) - 1 from posts where posts.thread_id = ${threads.id} and posts.deleted_at is null)`,
    })
    .from(threads)
    .leftJoin(users, eq(users.id, threads.authorId))
    .where(
      and(
        eq(threads.categoryId, category.id),
        isNull(threads.deletedAt),
        isNull(threads.archivedAt),
      ),
    )
    .orderBy(
      desc(threads.isPinned),
      desc(threads.lastActivityAt),
      desc(threads.createdAt),
    )
    .limit(LIMIT + 1)
    .offset((page - 1) * LIMIT);
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <Link href="/community" className="text-sm text-violet-300">
          ← All spaces
        </Link>
        <div className="my-10">
          <h1 className="text-4xl font-semibold">{category.name}</h1>
          <p className="mt-3 text-slate-400">{category.description}</p>
          <p className="mt-3 text-xs text-slate-500">
            Created <DateLabel date={category.createdAt} />
          </p>
        </div>
        <div className="space-y-3">
          {list.length ? (
            list.slice(0, LIMIT).map(({ thread, author, replies }) => (
              <Link
                key={thread.id}
                href={`/threads/${thread.id}`}
                className={`${panel} block transition hover:border-violet-400/40`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    {thread.isPinned && (
                      <span className="mr-2 text-violet-300">✳ Pinned</span>
                    )}
                    {thread.title}
                    {thread.isLocked && (
                      <span className="ml-2 text-xs text-slate-500">🔒</span>
                    )}
                  </h2>
                  <span className="text-xs text-slate-500">
                    <DateLabel date={thread.lastActivityAt} />
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400">
                  by {author?.displayName ?? author?.handle ?? "Former member"}{" "}
                  · {Math.max(0, replies)} replies · {thread.viewCount} views
                </p>
              </Link>
            ))
          ) : (
            <Empty>No discussions here yet. Be the first to start one.</Empty>
          )}
        </div>
        <Pagination
          page={page}
          hasMore={list.length > LIMIT}
          base={`/categories/${category.slug}`}
        />
        <div className="mt-14">
          {actor ? (
            <ThreadForm categoryId={category.id} />
          ) : (
            <p className="text-slate-400">
              <Link className="text-violet-300" href="/login">
                Sign in
              </Link>{" "}
              to start a discussion.
            </p>
          )}
        </div>
      </Shell>
    </>
  );
}
