import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import {
  mentions,
  toggleBookmark,
  markRead,
  unreadCount,
  search,
} from "../src/lib/forum/extra";
import {
  limit,
  deduplicate,
  RateLimitError,
  fingerprint,
} from "../src/lib/forum/rate";
import { avatarType, avatarKey, readAvatar } from "../src/lib/forum/avatar";
import { boundedForm } from "../src/lib/forum/requests";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../src/db/schema";
import {
  createCategory,
  updateCategory,
  createThread,
  reply,
  editPost,
  removePost,
  moderateThread,
  toggleReaction,
  reportContent,
  resolveReport,
  setRole,
  updateProfile,
} from "../src/lib/forum/service";
import {
  canEdit,
  canModerate,
  canAdmin,
  type Actor,
} from "../src/lib/forum/permissions";

const user: Actor = { id: "user-1", role: "user" };
const other: Actor = { id: "user-2", role: "user" };
const mod: Actor = { id: "mod-1", role: "moderator" };
const admin: Actor = { id: "admin-1", role: "admin" };
let client: Client;
let file: string;
let db: ReturnType<typeof drizzle<typeof schema>>;
let categoryId: string;

beforeEach(async () => {
  file = join(tmpdir(), `yori-test-${crypto.randomUUID()}.db`);
  client = createClient({ url: `file:${file}` });
  db = drizzle(client, { schema });
  const migration =
    readFileSync("drizzle/0000_ambiguous_master_chief.sql", "utf8") +
    "\n--> statement-breakpoint\n" +
    readFileSync("drizzle/0001_known_christian_walker.sql", "utf8") +
    "\n--> statement-breakpoint\n" +
    readFileSync("drizzle/0002_smooth_ogun.sql", "utf8") +
    "\n--> statement-breakpoint\n" +
    readFileSync("drizzle/0003_material_diamondback.sql", "utf8") +
    "\n--> statement-breakpoint\n" +
    readFileSync("drizzle/0004_ambiguous_mathemanic.sql", "utf8");
  for (const statement of migration
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean))
    await client.execute(statement);
  for (const actor of [user, other, mod, admin])
    await db.insert(schema.users).values({ id: actor.id, handle: actor.id });
  categoryId = await createCategory(db, admin, {
    name: "General",
    slug: "general",
  });
});
afterEach(() => {
  client.close();
  unlinkSync(file);
});

async function thread() {
  return createThread(db, user, {
    categoryId,
    title: "A new conversation",
    body: "First post",
  });
}
async function firstPost(threadId: string) {
  const row = await db.query.posts.findFirst({
    where: eq(schema.posts.threadId, threadId),
  });
  if (!row) throw Error("missing post");
  return row;
}

describe("permissions and constraints", () => {
  it("separates user, moderator and admin rights", async () => {
    expect(canModerate(user)).toBe(false);
    expect(canModerate(mod)).toBe(true);
    expect(canAdmin(mod)).toBe(false);
    expect(canEdit(other, user.id, new Date(), 30)).toBe(false);
    await expect(
      createCategory(db, mod, { name: "Secret", slug: "secret" }),
    ).rejects.toThrow("Not permitted");
    await expect(setRole(db, mod, user.id, "admin")).rejects.toThrow(
      "Not permitted",
    );
    await expect(setRole(db, admin, admin.id, "user")).rejects.toThrow(
      "Cannot change your own role",
    );
    await setRole(db, admin, other.id, "moderator");
    expect(
      (await db.query.users.findFirst({ where: eq(schema.users.id, other.id) }))
        ?.roleId,
    ).toBe("moderator");
  });
  it("validates category, profile, uniqueness and archive", async () => {
    await expect(
      createCategory(db, admin, { name: "General", slug: "general" }),
    ).rejects.toThrow();
    await expect(
      createCategory(db, admin, { name: "Bad", slug: "../oops" }),
    ).rejects.toThrow();
    await updateCategory(db, admin, categoryId, {
      name: "General",
      slug: "general",
      sortOrder: 4,
      archived: true,
    });
    await expect(thread()).rejects.toThrow("Category unavailable");
    await expect(
      updateProfile(db, user, { handle: "bad space", displayName: "Hi" }),
    ).rejects.toThrow();
  });
  it("creates a thread and its first post atomically, validates input and protects FK", async () => {
    await expect(
      createThread(db, user, { categoryId, title: "x", body: "hello" }),
    ).rejects.toThrow();
    const id = await thread();
    expect(
      (await db.query.posts.findMany({ where: eq(schema.posts.threadId, id) }))
        .length,
    ).toBe(1);
    await expect(
      db.insert(schema.posts).values({
        id: "orphan",
        threadId: "missing",
        authorId: user.id,
        body: "no",
      }),
    ).rejects.toThrow();
  });
  it("enforces posting and editing boundaries", async () => {
    const id = await thread(),
      first = await firstPost(id);
    await expect(editPost(db, other, first.id, "stolen")).rejects.toThrow(
      "Not permitted",
    );
    await editPost(db, user, first.id, "Updated first post");
    expect(
      (
        await db.query.postEdits.findFirst({
          where: eq(schema.postEdits.postId, first.id),
        })
      )?.previousBody,
    ).toBe("First post");
    await expect(removePost(db, user, first.id)).rejects.toThrow(
      "Archive the thread",
    );
    await reply(db, other, id, "A reply");
    const second = (
      await db.query.posts.findMany({ where: eq(schema.posts.threadId, id) })
    ).find((p) => p.id !== first.id)!;
    await expect(removePost(db, user, second.id)).rejects.toThrow(
      "Not permitted",
    );
    await removePost(db, mod, second.id);
    expect(
      (
        await db.query.posts.findFirst({
          where: eq(schema.posts.id, second.id),
        })
      )?.deletedAt,
    ).toBeTruthy();
    await moderateThread(db, mod, id, "lock");
    await expect(reply(db, other, id, "Another reply")).rejects.toThrow(
      "Thread is closed",
    );
    await moderateThread(db, mod, id, "unlock");
    await reply(db, other, id, "Another reply");
  });
  it("restricts moderation, preserves reports and validates reactions", async () => {
    const id = await thread(),
      post = await firstPost(id);
    await expect(moderateThread(db, user, id, "pin")).rejects.toThrow(
      "Not permitted",
    );
    await moderateThread(db, mod, id, "pin");
    expect(
      (await db.query.threads.findFirst({ where: eq(schema.threads.id, id) }))
        ?.isPinned,
    ).toBe(true);
    await toggleReaction(db, user, post.id, "like");
    await toggleReaction(db, user, post.id, "like");
    expect((await db.query.reactions.findMany()).length).toBe(0);
    await expect(toggleReaction(db, user, post.id, "<script>")).rejects.toThrow(
      "Invalid reaction",
    );
    await reportContent(db, other, "post", post.id, "This looks inappropriate");
    const report = (await db.query.reports.findFirst())!;
    await expect(
      resolveReport(db, user, report.id, "resolved"),
    ).rejects.toThrow("Not permitted");
    await resolveReport(db, mod, report.id, "resolved");
    await expect(resolveReport(db, mod, report.id, "resolved")).rejects.toThrow(
      "Report not open",
    );
    expect((await db.query.reports.findFirst())?.resolvedBy).toBe(mod.id);
    await expect(
      db.insert(schema.reports).values({
        id: "invalid",
        reporterId: user.id,
        reason: "bad",
        threadId: id,
        postId: post.id,
      }),
    ).rejects.toThrow();
    expect(
      (await db.query.moderationRecords.findMany()).length,
    ).toBeGreaterThan(0);
  });
});

describe("production features", () => {
  it("notifies thread author once for reply + repeated mention, respects self and read ownership", async () => {
    await updateProfile(db, user, { handle: "alice", displayName: "Alice" });
    const id = await thread();
    await reply(db, other, id, "Hello @alice and @alice again");
    expect(mentions("hey @alice @alice @bad! <img onerror=alert(1)>")).toEqual([
      "alice",
      "bad",
    ]);
    const list = await db.query.notifications.findMany();
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe(user.id);
    expect(list[0].kind).toBe("thread_reply");
    expect(await unreadCount(db, user)).toBe(1);
    await markRead(db, other, list[0].id);
    expect(await unreadCount(db, user)).toBe(1);
    await markRead(db, user, list[0].id);
    expect(await unreadCount(db, user)).toBe(0);
    await expect(
      reply(db, other, id, "Hello @alice and @alice again"),
    ).rejects.toThrow("Too many requests");
  });
  it("mentions valid unique users only, including on edits without repeating old mentions", async () => {
    await updateProfile(db, other, { handle: "bob_123", displayName: "Bob" });
    const id = await createThread(db, user, {
      categoryId,
      title: "Mentions in first post",
      body: "Hi @bob_123 @bob_123 @nobody",
    });
    const post = await firstPost(id);
    expect(
      (await db.query.notifications.findMany()).filter(
        (n) => n.kind === "mention",
      ),
    ).toHaveLength(1);
    await editPost(db, user, post.id, "Hi @bob_123 @bob_123 again");
    expect(
      (await db.query.notifications.findMany()).filter(
        (n) => n.kind === "mention",
      ),
    ).toHaveLength(1);
    await createThread(db, other, {
      categoryId,
      title: "My own mention test",
      body: "Hey @bob_123 me",
    });
    expect(
      (await db.query.notifications.findMany()).filter(
        (n) => n.userId === other.id,
      ),
    ).toHaveLength(1);
  });
  it("bookmarks are private and unique, archived content is not bookmarkable", async () => {
    const id = await thread();
    await toggleBookmark(db, user, id);
    expect(await db.query.bookmarks.findMany()).toHaveLength(1);
    await expect(
      db.insert(schema.bookmarks).values({ threadId: id, userId: user.id }),
    ).rejects.toThrow();
    await toggleBookmark(db, user, id);
    expect(await db.query.bookmarks.findMany()).toHaveLength(0);
    await moderateThread(db, mod, id, "archive");
    await expect(toggleBookmark(db, other, id)).rejects.toThrow(
      "Thread unavailable",
    );
  });
  it("searches content and author safely while hiding archived/deleted threads", async () => {
    await updateProfile(db, user, {
      handle: "searchable",
      displayName: "Alice",
    });
    const id = await thread();
    await reply(db, other, id, "A phrase about meteors");
    expect(
      (await search(db, "meteors", 1)).rows.map((row) => row.thread.id),
    ).toEqual([id]);
    expect((await search(db, "searchable", 1)).rows).toHaveLength(1);
    expect((await search(db, "%_", 1)).rows).toHaveLength(0);
    await expect(search(db, "' OR 1=1--", 1)).resolves.toMatchObject({
      rows: [],
    });
    await expect(search(db, " ", 1)).rejects.toThrow();
    await moderateThread(db, mod, id, "archive");
    expect((await search(db, "meteors", 1)).rows).toHaveLength(0);
  });
  it("limits atomically, isolates identities, expires buckets, rejects duplicate submissions", async () => {
    const at = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) await limit(db, "thread", "client", at);
    await expect(limit(db, "thread", "client", at)).rejects.toBeInstanceOf(
      RateLimitError,
    );
    await limit(db, "thread", "different", at);
    await limit(db, "thread", "client", at + 3600000);
    await deduplicate(db, user.id, "test", "same");
    await expect(
      deduplicate(db, user.id, "test", "same"),
    ).rejects.toBeInstanceOf(RateLimitError);
    await deduplicate(db, other.id, "test", "same");
  });
  it("reports resolution with reason and audit, moderation notifications and role boundaries", async () => {
    const id = await thread();
    await reportContent(db, other, "thread", id, "Reasonable report details");
    const report = (await db.query.reports.findFirst())!;
    await expect(
      resolveReport(db, user, report.id, "resolved"),
    ).rejects.toThrow("Not permitted");
    await resolveReport(
      db,
      mod,
      report.id,
      "resolved",
      "Investigated the issue",
    );
    expect(
      (await db.query.notifications.findMany()).some(
        (n) => n.userId === other.id && n.kind === "report_resolved",
      ),
    ).toBe(true);
    expect(
      (await db.query.moderationRecords.findMany()).some(
        (r) =>
          r.action === "resolved_report" &&
          r.reason === "Investigated the issue",
      ),
    ).toBe(true);
    await moderateThread(db, mod, id, "lock", "Needed a cooldown");
    expect(
      (await db.query.notifications.findMany()).some(
        (n) => n.userId === user.id && n.kind === "moderation",
      ),
    ).toBe(true);
    await expect(moderateThread(db, user, id, "unlock")).rejects.toThrow();
    await moderateThread(db, admin, id, "unlock");
    expect(
      (await db.query.moderationRecords.findMany()).filter(
        (r) => r.threadId === id && r.action.includes("thread"),
      ),
    ).toHaveLength(2);
    await updateCategory(db, admin, categoryId, {
      name: "General",
      slug: "general",
      sortOrder: 2,
    });
    expect(
      (await db.query.moderationRecords.findMany()).some(
        (r) => r.categoryId === categoryId && r.action === "update_category",
      ),
    ).toBe(true);
  });
  it("validates avatars and payload sizes without filesystem or remote storage", async () => {
    const png = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(avatarType(png, "image/png")).toBe("image/png");
    expect(() => avatarType(png, "image/svg+xml")).toThrow();
    expect(() =>
      avatarType(new Uint8Array(1024 * 1024 + 1), "image/png"),
    ).toThrow();
    expect(avatarKey(user.id, "image/png")).toMatch(
      /^avatars\/user-1\/[a-f0-9-]+\.png$/,
    );
    const request = new Request("https://example.com/api/avatar", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: png,
    });
    expect((await readAvatar(request)).type).toBe("image/png");
    const huge = new FormData();
    huge.set("body", "x".repeat(85001));
    expect(() => boundedForm(huge)).toThrow("Request too large");
  });
});

describe("adversarial cases", () => {
  it("only notifies a reply target inside the same thread and never trusts a guessed post id", async () => {
    const a = await thread();
    const b = await createThread(db, other, {
      categoryId,
      title: "Different thread here",
      body: "Other opener",
    });
    const foreignPost = await firstPost(b);
    await expect(
      reply(db, user, a, "Reply to wrong post", foreignPost.id),
    ).rejects.toThrow("Reply target unavailable");
    expect(
      (await db.query.posts.findMany({ where: eq(schema.posts.threadId, a) }))
        .length,
    ).toBe(1);
    await reply(db, user, b, "Reply to your post", foreignPost.id);
    expect(
      (await db.query.notifications.findMany()).some(
        (n) => n.userId === other.id && n.kind === "post_reply",
      ),
    ).toBe(true);
    expect(
      (await db.query.notifications.findMany()).filter(
        (n) => n.userId === other.id,
      ),
    ).toHaveLength(1);
  });
  it("rejects archived report targets and prevents no-op edit spam", async () => {
    const id = await thread(),
      post = await firstPost(id);
    await expect(editPost(db, user, post.id, "First post")).rejects.toThrow(
      "Post has no changes",
    );
    await moderateThread(db, mod, id, "archive");
    await expect(
      reportContent(db, other, "thread", id, "This is an old thread"),
    ).rejects.toThrow("Thread unavailable");
    await expect(
      reportContent(db, other, "post", post.id, "This is an old post"),
    ).rejects.toThrow("Post unavailable");
    await expect(toggleReaction(db, other, post.id, "like")).rejects.toThrow(
      "Post unavailable",
    );
  });
  it("blocks a second report submission and strips private identifiers from rate keys", async () => {
    const id = await thread();
    await reportContent(db, other, "thread", id, "A repeated report reason");
    await expect(
      reportContent(db, other, "thread", id, "A repeated report reason"),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(await db.query.reports.findMany()).toHaveLength(1);
    expect(await fingerprint("private@example.com")).toMatch(/^[a-f0-9]{64}$/);
    expect(await fingerprint("private@example.com")).toBe(
      await fingerprint("private@example.com"),
    );
  });
});
