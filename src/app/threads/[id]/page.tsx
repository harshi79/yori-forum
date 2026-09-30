import Link from "next/link";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { threads, posts, users } from "@/db/schema";
import { optionalActor } from "@/lib/forum/context";
import {
  canEdit,
  canModerate,
  EDIT_WINDOW_MINUTES,
} from "@/lib/forum/permissions";
import { pageNumber, identifier } from "@/lib/forum/validation";
import {
  Header,
  Shell,
  Empty,
  Pagination,
  DateLabel,
  panel,
} from "@/components/forum";
import { EditPostForm, ReplyForm, ReportForm } from "@/components/forms";
import {
  threadAction,
  removePostAction,
  reactionAction,
} from "@/lib/forum/actions";
import { RecordView } from "@/components/view";
const LIMIT = 20;
export const dynamic = "force-dynamic";
export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const id = identifier((await params).id),
    page = pageNumber((await searchParams).page),
    db = getDb();
  const thread = await db.query.threads.findFirst({
    where: and(
      eq(threads.id, id),
      isNull(threads.deletedAt),
      isNull(threads.archivedAt),
    ),
    with: { category: true, author: true },
  });
  if (!thread || thread.category.archivedAt) notFound();
  const actor = await optionalActor();
  const list = await db
    .select({
      post: posts,
      author: users,
      likes: sql<number>`(select count(*) from reactions where reactions.post_id = ${posts.id} and reactions.kind = 'like')`,
      hearts: sql<number>`(select count(*) from reactions where reactions.post_id = ${posts.id} and reactions.kind = 'heart')`,
      insights: sql<number>`(select count(*) from reactions where reactions.post_id = ${posts.id} and reactions.kind = 'insightful')`,
    })
    .from(posts)
    .leftJoin(users, eq(users.id, posts.authorId))
    .where(eq(posts.threadId, id))
    .orderBy(asc(posts.createdAt), asc(posts.id))
    .limit(LIMIT + 1)
    .offset((page - 1) * LIMIT);
  return (
    <>
      <Header actor={actor} />
      <RecordView id={id} />
      <Shell>
        <Link
          href={`/categories/${thread.category.slug}`}
          className="text-sm text-violet-300"
        >
          ← {thread.category.name}
        </Link>
        <div className="my-10">
          <p className="text-sm text-violet-300">
            {thread.isPinned ? "✳ Pinned · " : ""}
            {thread.isLocked ? "🔒 Locked · " : ""}
            {thread.category.name}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {thread.title}
          </h1>
          <p className="mt-4 text-sm text-slate-400">
            Started by{" "}
            {thread.author ? (
              <Link
                className="text-violet-300"
                href={`/u/${thread.author.handle}`}
              >
                {thread.author.displayName ?? thread.author.handle}
              </Link>
            ) : (
              "Former member"
            )}{" "}
            · <DateLabel date={thread.createdAt} /> · {thread.viewCount} views
          </p>
        </div>
        {actor && (
          <div className="mb-8 flex flex-wrap gap-3 text-sm">
            {(canModerate(actor) || actor.id === thread.authorId) && (
              <form action={threadAction}>
                <input type="hidden" name="id" value={id} />
                <button
                  name="operation"
                  value="archive"
                  className="text-rose-300"
                >
                  Archive thread
                </button>
              </form>
            )}
            {canModerate(actor) && (
              <>
                {[
                  ["pin", "unpin", thread.isPinned],
                  ["lock", "unlock", thread.isLocked],
                ].map(([yes, no, active]) => (
                  <form key={String(yes)} action={threadAction}>
                    <input type="hidden" name="id" value={id} />
                    <button
                      name="operation"
                      value={active ? String(no) : String(yes)}
                      className="text-violet-300"
                    >
                      {active ? String(no) : String(yes)}
                    </button>
                  </form>
                ))}
                <form action={threadAction}>
                  <input type="hidden" name="id" value={id} />
                  <button
                    name="operation"
                    value="delete"
                    className="text-rose-300"
                  >
                    Remove thread
                  </button>
                </form>
              </>
            )}
          </div>
        )}
        <div className="space-y-4">
          {list.length ? (
            list
              .slice(0, LIMIT)
              .map(({ post, author, likes, hearts, insights }) => (
                <article key={post.id} id={`post-${post.id}`} className={panel}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-full bg-violet-400/20 text-violet-200">
                        {(author?.displayName ??
                          author?.handle ??
                          "?")[0]?.toUpperCase()}
                      </span>
                      <div>
                        <p className="font-medium">
                          {author ? (
                            <Link
                              href={`/u/${author.handle}`}
                              className="hover:text-violet-300"
                            >
                              {author.displayName ?? author.handle}
                            </Link>
                          ) : (
                            "Former member"
                          )}{" "}
                          {author?.roleId && (
                            <span className="text-xs text-violet-300">
                              {author.roleId}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500">
                          <DateLabel date={post.createdAt} />
                          {post.editedAt && " · edited"}
                        </p>
                      </div>
                    </div>
                  </div>
                  {post.deletedAt ? (
                    <p className="mt-6 italic text-slate-500">
                      This post was removed.
                    </p>
                  ) : (
                    <>
                      <p className="mt-6 whitespace-pre-wrap break-words leading-relaxed text-slate-200">
                        {post.body}
                      </p>
                      <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4 text-sm text-slate-400">
                        {actor &&
                          (["like", "heart", "insightful"] as const).map(
                            (kind, i) => (
                              <form key={kind} action={reactionAction}>
                                <input
                                  type="hidden"
                                  name="id"
                                  value={post.id}
                                />
                                <input
                                  type="hidden"
                                  name="threadId"
                                  value={id}
                                />
                                <button
                                  name="kind"
                                  value={kind}
                                  className="hover:text-violet-300"
                                >
                                  {["♥", "❤️", "✦"][i]} {kind}{" "}
                                  {[likes, hearts, insights][i]}
                                </button>
                              </form>
                            ),
                          )}
                        {!actor && (
                          <span>
                            ♥ {likes} · ❤️ {hearts} · ✦ {insights}
                          </span>
                        )}
                        {actor &&
                          canEdit(
                            actor,
                            post.authorId,
                            post.createdAt,
                            EDIT_WINDOW_MINUTES,
                          ) && (
                            <>
                              {!(thread.isLocked && !canModerate(actor)) && (
                                <EditPostForm
                                  postId={post.id}
                                  threadId={id}
                                  body={post.body}
                                />
                              )}
                              <form action={removePostAction}>
                                <input
                                  type="hidden"
                                  name="id"
                                  value={post.id}
                                />
                                <input
                                  type="hidden"
                                  name="threadId"
                                  value={id}
                                />
                                <button className="text-rose-300">
                                  Remove
                                </button>
                              </form>
                            </>
                          )}
                        {actor && <ReportForm id={post.id} target="post" />}
                      </div>
                    </>
                  )}
                </article>
              ))
          ) : (
            <Empty>No posts on this page.</Empty>
          )}
        </div>
        <Pagination
          page={page}
          hasMore={list.length > LIMIT}
          base={`/threads/${id}`}
        />
        {actor && (
          <div className="mt-8">
            <ReportForm id={id} target="thread" />
          </div>
        )}
        <div className="mt-12">
          {thread.isLocked ? (
            <p className="text-slate-400">This discussion is locked.</p>
          ) : actor ? (
            <ReplyForm threadId={id} />
          ) : (
            <p className="text-slate-400">
              <Link href="/login" className="text-violet-300">
                Sign in
              </Link>{" "}
              to reply.
            </p>
          )}
        </div>
      </Shell>
    </>
  );
}
