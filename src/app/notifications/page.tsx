import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db/client";
import { notifications } from "@/db/schema";
import { currentActor } from "@/lib/forum/context";
import { pageNumber } from "@/lib/forum/validation";
import { readNotificationAction } from "@/lib/forum/actions";
import {
  Header,
  Shell,
  Empty,
  Pagination,
  DateLabel,
  panel,
} from "@/components/forum";
export const dynamic = "force-dynamic";
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const actor = await currentActor(),
    page = pageNumber((await searchParams).page);
  const list = await getDb().query.notifications.findMany({
    where: eq(notifications.userId, actor.id),
    orderBy: desc(notifications.createdAt),
    limit: 21,
    offset: (page - 1) * 20,
  });
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-4xl font-semibold">Your updates</h1>
          <form action={readNotificationAction}>
            <button className="text-sm text-violet-300">Mark all read</button>
          </form>
        </div>
        <div className="space-y-3">
          {list.length ? (
            list.slice(0, 20).map((n) => (
              <article
                key={n.id}
                className={`${panel} flex flex-wrap items-center justify-between gap-4 ${n.readAt ? "opacity-70" : "border-violet-400/40"}`}
              >
                <div>
                  <p className="text-xs uppercase tracking-wide text-violet-300">
                    {n.kind.replaceAll("_", " ")}
                  </p>
                  <p className="mt-2">{n.message}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    <DateLabel date={n.createdAt} />
                  </p>
                </div>
                <div className="flex gap-4 text-sm">
                  {/^\/(threads\/[a-zA-Z0-9_-]+|profile|notifications)(#post-[a-zA-Z0-9_-]+)?$/.test(
                    n.href,
                  ) && (
                    <Link className="text-violet-300" href={n.href}>
                      View →
                    </Link>
                  )}
                  {!n.readAt && (
                    <form action={readNotificationAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <button className="text-slate-300">Mark read</button>
                    </form>
                  )}
                </div>
              </article>
            ))
          ) : (
            <Empty>
              No updates yet. We’ll let you know when the conversation grows.
            </Empty>
          )}
        </div>
        <Pagination
          base="/notifications"
          page={page}
          hasMore={list.length > 20}
        />
      </Shell>
    </>
  );
}
