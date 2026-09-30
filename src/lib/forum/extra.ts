import { and, eq, isNull, desc, sql } from "drizzle-orm";
import type { getDb } from "@/db/client";
import {
  bookmarks,
  categories,
  notifications,
  threads,
  users,
} from "@/db/schema";
import { assertAllowed, type Actor } from "./permissions";
import { field, identifier } from "./validation";
import { limit } from "./rate";
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export function mentions(body: string) {
  return [
    ...new Set(
      Array.from(
        body.matchAll(/(?:^|[^\w@.])@([a-z0-9_-]{3,32})(?![\w])/gi),
        (m) => m[1].toLowerCase(),
      ),
    ),
  ].slice(0, 20);
}
export async function notify(
  tx: Tx,
  recipient: string | null,
  actor: Actor,
  kind: string,
  message: string,
  href: string,
  threadId?: string,
) {
  if (!recipient || recipient === actor.id) return;
  await tx.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: recipient,
    actorId: actor.id,
    threadId,
    kind,
    message,
    href,
  });
}
export async function notifyMentions(
  tx: Tx,
  actor: Actor,
  body: string,
  threadId: string,
  href: string,
  skip = new Set<string>(),
  previousBody = "",
) {
  const handles = mentions(body).filter(
    (name) => !mentions(previousBody).includes(name),
  );
  if (!handles.length) return;
  const list = await tx.query.users.findMany({
    where: and(
      isNull(users.deletedAt),
      sql`${users.handle} in (${sql.join(
        handles.map((h) => sql`${h}`),
        sql`, `,
      )})`,
    ),
  });
  const byHandle = new Map(
    list
      .filter((u) => handles.includes(u.handle.toLowerCase()))
      .map((u) => [u.handle.toLowerCase(), u]),
  );
  for (const name of handles) {
    const user = byHandle.get(name);
    if (user && !skip.has(user.id))
      await notify(
        tx,
        user.id,
        actor,
        "mention",
        `${name} was mentioned in a conversation`,
        href,
        threadId,
      );
  }
}
export async function toggleBookmark(db: Db, actor: Actor, id: string) {
  const threadId = identifier(id);
  await limit(db, "bookmark", actor.id);
  const thread = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
    with: { category: true },
  });
  assertAllowed(
    !!thread &&
      !thread.deletedAt &&
      !thread.archivedAt &&
      !thread.category.archivedAt,
    "Thread unavailable",
  );
  const deleted = await db
    .delete(bookmarks)
    .where(
      and(eq(bookmarks.threadId, threadId), eq(bookmarks.userId, actor.id)),
    )
    .returning();
  if (!deleted.length)
    await db
      .insert(bookmarks)
      .values({ threadId, userId: actor.id })
      .onConflictDoNothing();
}
export async function markRead(db: Db, actor: Actor, id?: string) {
  await limit(db, "notification", actor.id);
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, actor.id),
        isNull(notifications.readAt),
        id ? eq(notifications.id, identifier(id)) : undefined,
      ),
    );
}
export async function unreadCount(db: Db, actor: Actor) {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, actor.id), isNull(notifications.readAt)),
    );
  return row.count;
}
const escapeLike = (q: string) => q.replace(/[\\%_]/g, (m) => `\\${m}`);
export async function search(db: Db, raw: unknown, page: number) {
  const term = field(raw, "Search", 2, 80).replace(/\s+/g, " ");
  const pattern = `%${escapeLike(term)}%`;
  const matches = sql`(${threads.title} LIKE ${pattern} ESCAPE '\\' OR EXISTS (SELECT 1 FROM posts p WHERE p.thread_id = ${threads.id} AND p.deleted_at IS NULL AND p.body LIKE ${pattern} ESCAPE '\\') OR EXISTS (SELECT 1 FROM users u WHERE u.id = ${threads.authorId} AND u.deleted_at IS NULL AND u.handle LIKE ${pattern} ESCAPE '\\'))`;
  const rows = await db
    .select({ thread: threads, category: categories, author: users })
    .from(threads)
    .innerJoin(categories, eq(threads.categoryId, categories.id))
    .leftJoin(users, eq(threads.authorId, users.id))
    .where(
      and(
        isNull(threads.deletedAt),
        isNull(threads.archivedAt),
        isNull(categories.archivedAt),
        matches,
      ),
    )
    .orderBy(desc(threads.lastActivityAt))
    .limit(21)
    .offset((page - 1) * 20);
  return { term, rows };
}
