import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
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
    readFileSync("drizzle/0001_known_christian_walker.sql", "utf8");
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
