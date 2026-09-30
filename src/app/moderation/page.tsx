import { eq, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { reports } from "@/db/schema";
import { currentActor } from "@/lib/forum/context";
import { assertAllowed, canModerate } from "@/lib/forum/permissions";
import { resolveReportAction } from "@/lib/forum/actions";
import {
  Header,
  Shell,
  Empty,
  DateLabel,
  panel,
  button,
} from "@/components/forum";
export const dynamic = "force-dynamic";
export default async function Moderation() {
  const actor = await currentActor();
  assertAllowed(canModerate(actor));
  const list = await getDb().query.reports.findMany({
    where: eq(reports.status, "open"),
    orderBy: desc(reports.createdAt),
    limit: 100,
  });
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <h1 className="mb-8 text-4xl font-semibold">Community reports</h1>
        <div className="space-y-4">
          {list.length ? (
            list.map((r) => (
              <article className={panel} key={r.id}>
                <p className="text-xs text-slate-500">
                  <DateLabel date={r.createdAt} /> ·{" "}
                  {r.threadId ? "Thread" : "Post"} ID: {r.threadId ?? r.postId}{" "}
                  · Reporter: {r.reporterId}
                </p>
                <p className="my-5 whitespace-pre-wrap break-words">
                  {r.reason}
                </p>
                <form action={resolveReportAction} className="flex gap-3">
                  <input type="hidden" name="id" value={r.id} />
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
              </article>
            ))
          ) : (
            <Empty>No open reports. The community is all caught up.</Empty>
          )}
        </div>
      </Shell>
    </>
  );
}
