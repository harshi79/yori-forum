import { relations, sql } from "drizzle-orm";
import {
  index,
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) => integer(name, { mode: "timestamp" });
const createdAt = () =>
  timestamp("created_at")
    .notNull()
    .default(sql`(unixepoch())`);
const updatedAt = () =>
  timestamp("updated_at")
    .notNull()
    .default(sql`(unixepoch())`);

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    handle: text("handle").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    roleId: text("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    uniqueIndex("users_handle_unique").on(t.handle),
    index("users_role_idx").on(t.roleId),
  ],
);

// Auth provider identity is distinct from forum profile; no Supabase database is used.
export const authIdentities = sqliteTable(
  "auth_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("auth_provider_user_unique").on(t.provider, t.providerUserId),
    index("auth_user_idx").on(t.userId),
  ],
);

// Optional application-side session metadata; Supabase owns access/refresh tokens.
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  archivedAt: timestamp("archived_at"),
});

export const threads = sqliteTable(
  "threads",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    isPinned: integer("is_pinned", { mode: "boolean" })
      .notNull()
      .default(false),
    viewCount: integer("view_count").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at")
      .notNull()
      .default(sql`(unixepoch())`),
    archivedAt: timestamp("archived_at"),
    isLocked: integer("is_locked", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    uniqueIndex("threads_category_slug_unique").on(t.categoryId, t.slug),
    index("threads_category_created_idx").on(t.categoryId, t.createdAt),
    index("threads_author_idx").on(t.authorId),
    index("threads_activity_idx").on(t.categoryId, t.lastActivityAt),
  ],
);

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at"),
    editedAt: timestamp("edited_at"),
  },
  (t) => [
    index("posts_thread_created_idx").on(t.threadId, t.createdAt),
    index("posts_author_idx").on(t.authorId),
  ],
);

export const reactions = sqliteTable(
  "reactions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.postId, t.kind] }),
    index("reactions_post_idx").on(t.postId),
    check(
      "reactions_kind_check",
      sql`${t.kind} in ('like', 'heart', 'insightful')`,
    ),
  ],
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.threadId] }),
    index("bookmarks_thread_idx").on(t.threadId),
    index("bookmarks_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    threadId: text("thread_id").references(() => threads.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    href: text("href").notNull().default("/community"),
    readAt: timestamp("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_unread_idx").on(t.userId, t.readAt),
  ],
);

export const moderationRecords = sqliteTable(
  "moderation_records",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    moderatorId: text("moderator_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetUserId: text("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    threadId: text("thread_id").references(() => threads.id, {
      onDelete: "set null",
    }),
    postId: text("post_id").references(() => posts.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("moderation_target_idx").on(t.targetUserId, t.createdAt),
    index("moderation_thread_idx").on(t.threadId),
  ],
);

export const userRelations = relations(users, ({ one, many }) => ({
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  identities: many(authIdentities),
  threads: many(threads),
  posts: many(posts),
}));
export const identityRelations = relations(authIdentities, ({ one }) => ({
  user: one(users, { fields: [authIdentities.userId], references: [users.id] }),
}));
export const threadRelations = relations(threads, ({ one, many }) => ({
  category: one(categories, {
    fields: [threads.categoryId],
    references: [categories.id],
  }),
  author: one(users, { fields: [threads.authorId], references: [users.id] }),
  posts: many(posts),
}));
export const postRelations = relations(posts, ({ one }) => ({
  thread: one(threads, { fields: [posts.threadId], references: [threads.id] }),
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
}));
export const categoryRelations = relations(categories, ({ many }) => ({
  threads: many(threads),
}));

export const postEdits = sqliteTable(
  "post_edits",
  {
    id: text("id").primaryKey(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    editorId: text("editor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    previousBody: text("previous_body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("post_edits_post_idx").on(t.postId)],
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => threads.id, {
      onDelete: "set null",
    }),
    postId: text("post_id").references(() => posts.id, {
      onDelete: "set null",
    }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("open"),
    resolvedBy: text("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reports_status_created_idx").on(t.status, t.createdAt),
    index("reports_reporter_idx").on(t.reporterId),
    check(
      "reports_target_check",
      sql`(${t.threadId} is not null and ${t.postId} is null) or (${t.threadId} is null and ${t.postId} is not null)`,
    ),
    check(
      "reports_status_check",
      sql`${t.status} in ('open', 'resolved', 'dismissed')`,
    ),
  ],
);

// Atomic fixed-window counters shared by all Workers; no per-isolate memory or Redis.
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(0),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("rate_limits_expires_idx").on(t.expiresAt)],
);
