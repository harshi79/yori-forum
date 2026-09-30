import { and, eq, sql, isNull } from "drizzle-orm";
import type { getDb } from "@/db/client";
import {
  categories,
  threads,
  posts,
  postEdits,
  reactions,
  reports,
  moderationRecords,
  users,
  roles,
} from "@/db/schema";
import {
  assertAllowed,
  canAdmin,
  canEdit,
  canModerate,
  EDIT_WINDOW_MINUTES,
  ForumError,
  type Actor,
} from "./permissions";
import { field, identifier, slug } from "./validation";
import { limit, deduplicate } from "./rate";
import { notify, notifyMentions } from "./extra";

type Db = ReturnType<typeof getDb>;
const now = () => new Date();
const log = (
  actor: Actor,
  action: string,
  target: {
    threadId?: string;
    postId?: string;
    targetUserId?: string;
    categoryId?: string;
  },
) => ({ id: crypto.randomUUID(), moderatorId: actor.id, action, ...target });

export async function createCategory(
  db: Db,
  actor: Actor,
  input: {
    name: unknown;
    slug: unknown;
    description?: unknown;
    sortOrder?: unknown;
  },
) {
  assertAllowed(canAdmin(actor));
  const name = field(input.name, "Name", 2, 80),
    key = slug(input.slug);
  const description = input.description
    ? field(input.description, "Description", 1, 500)
    : null;
  const sortOrder = Number(input.sortOrder ?? 0);
  assertAllowed(
    Number.isSafeInteger(sortOrder) && sortOrder >= 0 && sortOrder <= 100000,
    "Invalid order",
  );
  await limit(db, "category", actor.id);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(categories)
      .values({ id, name, slug: key, description, sortOrder });
    await tx
      .insert(moderationRecords)
      .values(log(actor, "create_category", { categoryId: id }));
  });
  return id;
}
export async function updateCategory(
  db: Db,
  actor: Actor,
  id: string,
  input: {
    name: unknown;
    slug: unknown;
    description?: unknown;
    sortOrder?: unknown;
    archived?: unknown;
  },
) {
  assertAllowed(canAdmin(actor));
  const name = field(input.name, "Name", 2, 80),
    key = slug(input.slug);
  const order = Number(input.sortOrder ?? 0);
  assertAllowed(
    Number.isSafeInteger(order) && order >= 0 && order <= 100000,
    "Invalid order",
  );
  await limit(db, "category", actor.id);
  await db.transaction(async (tx) => {
    const result = await tx
      .update(categories)
      .set({
        name,
        slug: key,
        description: input.description
          ? field(input.description, "Description", 1, 500)
          : null,
        sortOrder: order,
        archivedAt: input.archived === true ? now() : null,
        updatedAt: now(),
      })
      .where(eq(categories.id, identifier(id)))
      .returning({ id: categories.id });
    assertAllowed(result.length > 0, "Category not found");
    await tx.insert(moderationRecords).values(
      log(actor, input.archived ? "archive_category" : "update_category", {
        categoryId: id,
      }),
    );
  });
}
export async function createThread(
  db: Db,
  actor: Actor,
  input: { categoryId: unknown; title: unknown; body: unknown },
) {
  const categoryId = identifier(input.categoryId),
    title = field(input.title, "Title", 5, 160),
    body = field(input.body, "Post", 2, 20000);
  const category = await db.query.categories.findFirst({
    where: and(eq(categories.id, categoryId), isNull(categories.archivedAt)),
  });
  assertAllowed(!!category, "Category unavailable");
  await limit(db, "thread", actor.id);
  await deduplicate(db, actor.id, "thread", `${categoryId}:${title}:${body}`);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(threads).values({
      id,
      categoryId,
      authorId: actor.id,
      title,
      slug: `${slug(
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48) || "thread",
      )}-${id.slice(0, 8)}`,
    });
    await tx.insert(posts).values({
      id: crypto.randomUUID(),
      threadId: id,
      authorId: actor.id,
      body,
    });
    await notifyMentions(tx, actor, body, id, `/threads/${id}`);
  });
  return id;
}
export async function reply(
  db: Db,
  actor: Actor,
  threadId: string,
  raw: unknown,
  parentId?: string,
) {
  const body = field(raw, "Reply", 2, 20000),
    id = identifier(threadId);
  await limit(db, "reply", actor.id);
  const active = await db.query.threads.findFirst({
    where: eq(threads.id, id),
    with: { category: true },
  });
  assertAllowed(
    !!active &&
      !active.deletedAt &&
      !active.archivedAt &&
      !active.isLocked &&
      !active.category.archivedAt,
    "Thread is closed",
  );
  await deduplicate(db, actor.id, "reply", `${id}:${body}`);
  await db.transaction(async (tx) => {
    const thread = await tx.query.threads.findFirst({
      where: eq(threads.id, id),
      with: { category: true },
    });
    assertAllowed(
      !!thread &&
        !thread.deletedAt &&
        !thread.archivedAt &&
        !thread.isLocked &&
        !thread.category.archivedAt,
      "Thread is closed",
    );
    const parent = parentId
      ? await tx.query.posts.findFirst({
          where: and(
            eq(posts.id, identifier(parentId)),
            eq(posts.threadId, id),
            isNull(posts.deletedAt),
          ),
        })
      : null;
    if (parentId) assertAllowed(!!parent, "Reply target unavailable");
    const postId = crypto.randomUUID();
    await tx
      .insert(posts)
      .values({ id: postId, threadId: id, authorId: actor.id, body });
    const href = `/threads/${id}#post-${postId}`;
    const recipients = new Set<string>();
    for (const recipient of [parent?.authorId, thread.authorId]) {
      if (recipient && !recipients.has(recipient)) {
        await notify(
          tx,
          recipient,
          actor,
          recipient === parent?.authorId ? "post_reply" : "thread_reply",
          "Someone replied to your conversation",
          href,
          id,
        );
        recipients.add(recipient);
      }
    }
    await notifyMentions(tx, actor, body, id, href, recipients);
    await tx
      .update(threads)
      .set({ lastActivityAt: now(), updatedAt: now() })
      .where(eq(threads.id, id));
  });
}
export async function editPost(db: Db, actor: Actor, id: string, raw: unknown) {
  const body = field(raw, "Post", 2, 20000),
    postId = identifier(id);
  await limit(db, "edit", actor.id);
  await db.transaction(async (tx) => {
    const post = await tx.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: { thread: { with: { category: true } } },
    });
    assertAllowed(
      !!post &&
        !post.deletedAt &&
        !post.thread.deletedAt &&
        ((!post.thread.archivedAt && !post.thread.category.archivedAt) ||
          canModerate(actor)),
      "Post unavailable",
    );
    assertAllowed(
      canEdit(actor, post.authorId, post.createdAt, EDIT_WINDOW_MINUTES),
    );
    assertAllowed(body !== post.body, "Post has no changes");
    assertAllowed(
      !post.thread.isLocked || canModerate(actor),
      "Thread is locked",
    );
    await tx.insert(postEdits).values({
      id: crypto.randomUUID(),
      postId,
      editorId: actor.id,
      previousBody: post.body,
    });
    await tx
      .update(posts)
      .set({ body, editedAt: now(), updatedAt: now() })
      .where(eq(posts.id, postId));
    if (canModerate(actor) && actor.id !== post.authorId) {
      await tx
        .insert(moderationRecords)
        .values(log(actor, "edit_post", { postId }));
      await notify(
        tx,
        post.authorId,
        actor,
        "moderation",
        "A moderator edited your post",
        `/threads/${post.threadId}#post-${postId}`,
        post.threadId,
      );
    }
    await notifyMentions(
      tx,
      actor,
      body,
      post.threadId,
      `/threads/${post.threadId}#post-${postId}`,
      new Set(),
      post.body,
    );
  });
}
export async function removePost(db: Db, actor: Actor, id: string) {
  const postId = identifier(id);
  await limit(db, "moderation", actor.id);
  await db.transaction(async (tx) => {
    const post = await tx.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: { thread: true },
    });
    assertAllowed(
      !!post && !post.deletedAt && !post.thread.deletedAt,
      "Post unavailable",
    );
    assertAllowed(
      canEdit(actor, post.authorId, post.createdAt, EDIT_WINDOW_MINUTES),
    );
    // First post must remain as the thread opener; archive the thread instead.
    const first = await tx.query.posts.findFirst({
      where: eq(posts.threadId, post.threadId),
      orderBy: sql`${posts.createdAt} asc, rowid asc`,
    });
    assertAllowed(
      first?.id !== postId,
      "Archive the thread instead of removing its first post",
    );
    await tx
      .update(posts)
      .set({ deletedAt: now(), updatedAt: now() })
      .where(eq(posts.id, postId));
    if (canModerate(actor)) {
      await tx
        .insert(moderationRecords)
        .values(log(actor, "remove_post", { postId }));
      await notify(
        tx,
        post.authorId,
        actor,
        "moderation",
        "A moderator removed your post",
        `/threads/${post.threadId}`,
        post.threadId,
      );
    }
  });
}
export async function moderateThread(
  db: Db,
  actor: Actor,
  id: string,
  operation: string,
  reason?: unknown,
) {
  const threadId = identifier(id);
  const note = reason ? field(reason, "Reason", 1, 500) : null;
  await limit(db, "moderation", actor.id);
  assertAllowed(
    ["pin", "unpin", "lock", "unlock", "archive", "restore", "delete"].includes(
      operation,
    ),
    "Invalid action",
  );
  await db.transaction(async (tx) => {
    const thread = await tx.query.threads.findFirst({
      where: eq(threads.id, threadId),
    });
    assertAllowed(!!thread && !thread.deletedAt, "Thread unavailable");
    const ownArchive = operation === "archive" && actor.id === thread.authorId;
    assertAllowed(canModerate(actor) || ownArchive);
    const patch =
      operation === "pin"
        ? { isPinned: true }
        : operation === "unpin"
          ? { isPinned: false }
          : operation === "lock"
            ? { isLocked: true }
            : operation === "unlock"
              ? { isLocked: false }
              : operation === "restore"
                ? { archivedAt: null }
                : operation === "delete"
                  ? { deletedAt: now() }
                  : { archivedAt: now() };
    await tx
      .update(threads)
      .set({ ...patch, updatedAt: now() })
      .where(eq(threads.id, threadId));
    if (canModerate(actor)) {
      await tx.insert(moderationRecords).values({
        ...log(actor, operation + "_thread", { threadId }),
        reason: note,
      });
      await notify(
        tx,
        thread.authorId,
        actor,
        "moderation",
        `A moderator ${({ pin: "pinned", unpin: "unpinned", lock: "locked", unlock: "unlocked", archive: "archived", restore: "restored", delete: "removed" } as Record<string, string>)[operation]} your thread`,
        `/threads/${threadId}`,
        threadId,
      );
    }
  });
}
export async function toggleReaction(
  db: Db,
  actor: Actor,
  id: string,
  kind: string,
) {
  assertAllowed(
    ["like", "heart", "insightful"].includes(kind),
    "Invalid reaction",
  );
  const postId = identifier(id);
  await limit(db, "reaction", actor.id);
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    with: { thread: { with: { category: true } } },
  });
  assertAllowed(
    !!post &&
      !post.thread.category.archivedAt &&
      !post.deletedAt &&
      !post.thread.deletedAt &&
      !post.thread.archivedAt,
    "Post unavailable",
  );
  // One reaction of each kind per user/post; unique composite PK enforces concurrency safety.
  const deleted = await db
    .delete(reactions)
    .where(
      and(
        eq(reactions.postId, postId),
        eq(reactions.userId, actor.id),
        eq(reactions.kind, kind),
      ),
    )
    .returning();
  if (!deleted.length)
    await db
      .insert(reactions)
      .values({ postId, userId: actor.id, kind })
      .onConflictDoNothing();
}
export async function reportContent(
  db: Db,
  actor: Actor,
  target: "thread" | "post",
  id: string,
  raw: unknown,
) {
  const reason = field(raw, "Reason", 10, 1000),
    targetId = identifier(id);
  await limit(db, "report", actor.id);
  if (target === "thread") {
    const thread = await db.query.threads.findFirst({
      where: and(
        eq(threads.id, targetId),
        isNull(threads.deletedAt),
        isNull(threads.archivedAt),
      ),
      with: { category: true },
    });
    assertAllowed(
      !!thread && !thread.category.archivedAt,
      "Thread unavailable",
    );
  } else {
    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, targetId), isNull(posts.deletedAt)),
      with: { thread: { with: { category: true } } },
    });
    assertAllowed(
      !!post &&
        !post.thread.deletedAt &&
        !post.thread.archivedAt &&
        !post.thread.category.archivedAt,
      "Post unavailable",
    );
  }
  await deduplicate(db, actor.id, "report", `${target}:${targetId}:${reason}`);
  await db.insert(reports).values({
    id: crypto.randomUUID(),
    reporterId: actor.id,
    reason,
    threadId: target === "thread" ? targetId : null,
    postId: target === "post" ? targetId : null,
  });
}
export async function resolveReport(
  db: Db,
  actor: Actor,
  id: string,
  status: string,
  reason?: unknown,
) {
  assertAllowed(canModerate(actor));
  assertAllowed(
    status === "resolved" || status === "dismissed",
    "Invalid status",
  );
  const note = reason ? field(reason, "Reason", 1, 500) : null;
  await limit(db, "moderation", actor.id);
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(reports)
      .set({ status, resolvedBy: actor.id, resolvedAt: now() })
      .where(and(eq(reports.id, identifier(id)), eq(reports.status, "open")))
      .returning();
    assertAllowed(rows.length === 1, "Report not open");
    await notify(
      tx,
      rows[0].reporterId,
      actor,
      status === "resolved" ? "report_resolved" : "report_dismissed",
      `Your report was ${status}`,
      rows[0].threadId ? `/threads/${rows[0].threadId}` : "/notifications",
      rows[0].threadId ?? undefined,
    );
    await tx.insert(moderationRecords).values({
      ...log(actor, `${status}_report`, {
        threadId: rows[0].threadId ?? undefined,
        postId: rows[0].postId ?? undefined,
      }),
      reason: note,
    });
  });
}
export async function updateProfile(
  db: Db,
  actor: Actor,
  input: { handle: unknown; displayName: unknown; bio?: unknown },
) {
  const handle = field(input.handle, "Username", 3, 32).toLowerCase();
  assertAllowed(
    /^[a-z0-9_-]+$/.test(handle),
    "Username: letters, numbers, _ and - only",
  );
  await limit(db, "profile", actor.id);
  await db
    .update(users)
    .set({
      handle,
      displayName: field(input.displayName, "Display name", 2, 80),
      bio: input.bio ? field(input.bio, "Bio", 1, 500) : null,
      updatedAt: now(),
    })
    .where(eq(users.id, actor.id));
}
export async function setRole(
  db: Db,
  actor: Actor,
  userId: string,
  role: string,
) {
  assertAllowed(canAdmin(actor));
  assertAllowed(["user", "moderator", "admin"].includes(role), "Invalid role");
  assertAllowed(userId !== actor.id, "Cannot change your own role");
  await limit(db, "moderation", actor.id);
  const roleId = role === "user" ? null : role;
  await db.transaction(async (tx) => {
    if (roleId)
      await tx
        .insert(roles)
        .values({ id: roleId, name: roleId })
        .onConflictDoNothing();
    const updated = await tx
      .update(users)
      .set({ roleId, updatedAt: now() })
      .where(and(eq(users.id, identifier(userId)), isNull(users.deletedAt)))
      .returning();
    assertAllowed(updated.length === 1, "User unavailable");
    await tx
      .insert(moderationRecords)
      .values(log(actor, `set_role_${role}`, { targetUserId: userId }));
    await notify(
      tx,
      userId,
      actor,
      "moderation",
      `Your role was changed to ${role}`,
      "/profile",
    );
  });
}
export function asMessage(error: unknown) {
  return error instanceof ForumError
    ? error.message
    : "Unable to save. Please try again.";
}
