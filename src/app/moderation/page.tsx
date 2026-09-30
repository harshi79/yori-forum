import Link from "next/link";
import { desc, inArray, isNotNull, isNull, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { reports, moderationRecords, posts, threads, users } from "@/db/schema";
import { currentActor } from "@/lib/forum/context";
import { assertAllowed, canModerate } from "@/lib/forum/permissions";
import { resolveReportAction, threadAction } from "@/lib/forum/actions";
import {
  Header,
  Shell,
  Empty,
  DateLabel,
  panel,
  button,
  Pagination,
} from "@/components/forum";
import { pageNumber } from "@/lib/forum/validation";
export const dynamic = "force-dynamic";
export default async function Moderation({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await currentActor();
  assertAllowed(canModerate(actor));
  const page = pageNumber((await searchParams).page),
    db = getDb();
  const [list, records, archived] = await Promise.all([
    db.query.reports.findMany({
      orderBy: desc(reports.createdAt),
      limit: 21,
      offset: (page - 1) * 20,
    }),
    db.query.moderationRecords.findMany({
      orderBy: desc(moderationRecords.createdAt),
      limit: 30,
    }),
    db.query.threads.findMany({
      where: and(isNotNull(threads.archivedAt), isNull(threads.deletedAt)),
      orderBy: desc(threads.archivedAt),
      limit: 30,
    }),
  ]);
  const postIds = [
    ...new Set(
      [...list.map((r) => r.postId), ...records.map((r) => r.postId)].filter(
        (v): v is string => !!v,
      ),
    ),
  ];
  const threadIds = [
    ...new Set(
      [
        ...list.map((r) => r.threadId),
        ...records.map((r) => r.threadId),
      ].filter((v): v is string => !!v),
    ),
  ];
  const userIds = [
    ...new Set(
      [
        ...records.map((r) => r.moderatorId),
        ...list.map((r) => r.reporterId),
        ...list.map((r) => r.resolvedBy),
      ].filter((v): v is string => !!v),
    ),
  ];
  const [postRows, threadRows, userRows] = await Promise.all([
    postIds.length
      ? db.select().from(posts).where(inArray(posts.id, postIds))
      : [],
    threadIds.length
      ? db.select().from(threads).where(inArray(threads.id, threadIds))
      : [],
    userIds.length
      ? db.select().from(users).where(inArray(users.id, userIds))
      : [],
  ]);
  const postMap = new Map(postRows.map((p) => [p.id, p]));
  const threadMap = new Map(threadRows.map((t) => [t.id, t]));
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  function target(threadId: string | null, postId: string | null) {
    const post = postId ? postMap.get(postId) : null,
      thread = threadId
        ? threadMap.get(threadId)
        : post
          ? threadMap.get(post.threadId)
          : null;
    return (
      <>
        <p className="mt-3 whitespace-pre-wrap break-words text-slate-300">
          {post
            ? post.body.slice(0, 500)
            : (thread?.title ?? "Content unavailable")}
        </p>
        {thread && (
          <Link
            href={`/threads/${thread.id}`}
            className="text-sm text-violet-300"
          >
            View thread ↗
          </Link>
        )}
      </>
    );
  }
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <h1 className="mb-3 text-4xl font-semibold">Moderation</h1>
        <p className="mb-10 text-slate-400">
          Reports and recent decisions, visible only to the moderation team.
        </p>
        <h2 className="mb-5 text-xl font-semibold">Reports</h2>
        <div className="space-y-4">
          {list.length ? (
            list.slice(0, 20).map((r) => (
              <article className={panel} key={r.id}>
                <p className="text-xs text-violet-300">
                  {r.status.toUpperCase()} · <DateLabel date={r.createdAt} /> ·
                  reported by{" "}
                  {userMap.get(r.reporterId)?.handle ?? "Former member"}
                </p>
                {target(r.threadId, r.postId)}
                <p className="my-4 border-l-2 border-violet-400/40 pl-3 whitespace-pre-wrap break-words">
                  {r.reason}
                </p>
                {r.resolvedAt && (
                  <p className="text-xs text-slate-500">
                    Closed <DateLabel date={r.resolvedAt} /> by{" "}
                    {userMap.get(r.resolvedBy ?? "")?.handle ??
                      "Former moderator"}
                  </p>
                )}
                {r.status === "open" && (
                  <form
                    action={resolveReportAction}
                    className="flex flex-wrap gap-3"
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      name="reason"
                      placeholder="Resolution note (optional)"
                      maxLength={500}
                      className="rounded-xl border border-white/15 bg-white/5 p-2"
                    />
                    <button name="status" value="resolved" className={button}>
                      Resolve
                    </button>
                    <button
                      name="status"
                      value="dismissed"
                      className="text-slate-300"
                    >
                      Dismiss
                    </button>
                  </form>
                )}
              </article>
            ))
          ) : (
            <Empty>No reports yet.</Empty>
          )}
        </div>
        <Pagination page={page} hasMore={list.length > 20} base="/moderation" />
        <h2 className="mb-5 mt-14 text-xl font-semibold">Recent actions</h2>
        <div className="space-y-3">
          {records.length ? (
            records.map((r) => (
              <article key={r.id} className={panel}>
                <p className="text-sm font-semibold">
                  {r.action.replaceAll("_", " ")} ·{" "}
                  {userMap.get(r.moderatorId ?? "")?.handle ??
                    "Former moderator"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  <DateLabel date={r.createdAt} /> ·{" "}
                  {r.reason ?? "No reason provided"}
                </p>
                {target(r.threadId, r.postId)}
                {r.categoryId && (
                  <p className="text-sm text-slate-400">
                    Category ID: {r.categoryId}
                  </p>
                )}
                {r.targetUserId && (
                  <p className="text-sm text-slate-400">
                    Account ID: {r.targetUserId}
                  </p>
                )}
                {r.threadId && threadMap.get(r.threadId)?.archivedAt && (
                  <form action={threadAction} className="mt-3">
                    <input type="hidden" name="id" value={r.threadId} />
                    <button
                      name="operation"
                      value="restore"
                      className="text-sm text-violet-300"
                    >
                      Restore archived thread
                    </button>
                  </form>
                )}
              </article>
            ))
          ) : (
            <Empty>No moderation actions yet.</Empty>
          )}
        </div>
        <h2 className="mb-5 mt-14 text-xl font-semibold">
          Archived conversations
        </h2>
        <div className="space-y-3">
          {archived.length ? (
            archived.map((t) => (
              <article key={t.id} className={panel}>
                <h3 className="font-semibold">{t.title}</h3>
                <p className="mt-2 text-xs text-slate-500">
                  Archived <DateLabel date={t.archivedAt!} />
                </p>
                <form action={threadAction} className="mt-3">
                  <input type="hidden" name="id" value={t.id} />
                  <input
                    name="reason"
                    placeholder="Reason (optional)"
                    maxLength={500}
                    className="mr-3 rounded-xl border border-white/15 bg-white/5 p-2"
                  />
                  <button
                    name="operation"
                    value="restore"
                    className="text-sm text-violet-300"
                  >
                    Restore thread
                  </button>
                </form>
              </article>
            ))
          ) : (
            <Empty>No archived conversations.</Empty>
          )}
        </div>
      </Shell>
    </>
  );
}
