"use client";
import { useActionState } from "react";
import { button, input, panel } from "./forum";
import {
  createThreadAction,
  replyAction,
  editPostAction,
  profileAction,
  categoryAction,
  roleAction,
  reportAction,
  type ActionState,
} from "@/lib/forum/actions";
const initial: ActionState = { error: "" };
type Action = (state: ActionState, form: FormData) => Promise<ActionState>;
function Form({
  action,
  children,
  label,
}: {
  action: Action;
  children: React.ReactNode;
  label: string;
}) {
  const [state, submit, pending] = useActionState(action, initial);
  return (
    <form action={submit} className={`${panel} space-y-4`}>
      <h2 className="text-lg font-semibold">{label}</h2>
      {children}
      <button disabled={pending} className={button}>
        {pending ? "Saving…" : label}
      </button>
      {state.error && (
        <p role="alert" className="text-rose-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-emerald-300">
          {state.success}
        </p>
      )}
    </form>
  );
}
export function ThreadForm({ categoryId }: { categoryId: string }) {
  return (
    <Form action={createThreadAction} label="Start a discussion">
      <input type="hidden" name="categoryId" value={categoryId} />
      <input
        className={input}
        name="title"
        placeholder="What’s on your mind?"
        required
        minLength={5}
        maxLength={160}
      />
      <textarea
        className={input}
        name="body"
        placeholder="Give your conversation a thoughtful start…"
        rows={5}
        required
        minLength={2}
        maxLength={20000}
      />
    </Form>
  );
}
export function ReplyForm({
  threadId,
  parentId,
}: {
  threadId: string;
  parentId?: string;
}) {
  return (
    <Form action={replyAction} label="Post a reply">
      <input type="hidden" name="threadId" value={threadId} />
      {parentId && (
        <>
          <input type="hidden" name="parentId" value={parentId} />
          <p className="text-xs text-violet-300">
            Replying to a post in this thread
          </p>
        </>
      )}
      <textarea
        className={input}
        name="body"
        placeholder="Add to the conversation…"
        rows={4}
        required
        minLength={2}
        maxLength={20000}
      />
    </Form>
  );
}
export function EditPostForm({
  postId,
  threadId,
  body,
}: {
  postId: string;
  threadId: string;
  body: string;
}) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-violet-300">Edit post</summary>
      <Form action={editPostAction} label="Save edit">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="threadId" value={threadId} />
        <textarea
          className={input}
          name="body"
          defaultValue={body}
          rows={4}
          required
          maxLength={20000}
        />
      </Form>
    </details>
  );
}
export function ProfileForm({
  handle,
  displayName,
  bio,
}: {
  handle: string;
  displayName: string | null;
  bio: string | null;
}) {
  return (
    <Form action={profileAction} label="Update profile">
      <label className="block">
        Username
        <input
          className={input}
          name="handle"
          defaultValue={handle}
          required
          maxLength={32}
        />
      </label>
      <label className="block">
        Display name
        <input
          className={input}
          name="displayName"
          defaultValue={displayName ?? handle}
          required
          maxLength={80}
        />
      </label>
      <label className="block">
        Bio
        <textarea
          className={input}
          name="bio"
          defaultValue={bio ?? ""}
          maxLength={500}
        />
      </label>
      <p className="text-xs text-slate-400">
        Avatar images are not uploaded yet; an initial-based avatar is shown.
      </p>
    </Form>
  );
}
export function CategoryForm({
  category,
}: {
  category?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    sortOrder: number;
    archivedAt: Date | null;
  };
}) {
  return (
    <Form
      action={categoryAction}
      label={category ? "Update category" : "Add category"}
    >
      {category && <input type="hidden" name="id" value={category.id} />}
      <input
        className={input}
        name="name"
        placeholder="Name"
        defaultValue={category?.name}
        required
        maxLength={80}
      />
      <input
        className={input}
        name="slug"
        placeholder="url-slug"
        defaultValue={category?.slug}
        required
        maxLength={64}
      />
      <textarea
        className={input}
        name="description"
        placeholder="What belongs here?"
        defaultValue={category?.description ?? ""}
        maxLength={500}
      />
      <label className="block text-sm">
        Display order
        <input
          className={input}
          type="number"
          min="0"
          name="sortOrder"
          defaultValue={category?.sortOrder ?? 0}
        />
      </label>
      {category && (
        <label className="flex gap-2">
          <input
            type="checkbox"
            name="archived"
            defaultChecked={!!category.archivedAt}
          />{" "}
          Archived (hidden from public listings)
        </label>
      )}
    </Form>
  );
}
export function RoleForm() {
  return (
    <Form action={roleAction} label="Change user role">
      <input
        className={input}
        name="userId"
        placeholder="Forum user ID"
        required
      />
      <select name="role" className={input}>
        <option value="user">User</option>
        <option value="moderator">Moderator</option>
        <option value="admin">Admin</option>
      </select>
    </Form>
  );
}
export function ReportForm({
  id,
  target,
}: {
  id: string;
  target: "thread" | "post";
}) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-slate-400 hover:text-white">
        Report {target}
      </summary>
      <Form action={reportAction} label="Submit report">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="target" value={target} />
        <textarea
          className={input}
          name="reason"
          placeholder="Tell moderators what happened (10–1000 characters)"
          minLength={10}
          maxLength={1000}
          required
        />
      </Form>
    </details>
  );
}
