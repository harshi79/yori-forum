"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { currentActor } from "./context";
import * as forum from "./service";
import { assertAllowed, canAdmin, canModerate } from "./permissions";
import { boundedForm } from "./requests";
import { logOperationalError } from "@/lib/ops/log";
import { ForumError } from "./permissions";
import { toggleBookmark, markRead } from "./extra";
import { identifier } from "./validation";

export type ActionState = { error: string; success?: string };
const value = (form: FormData, key: string) => form.get(key);
async function attempt(fn: () => Promise<void>): Promise<ActionState> {
  try {
    await fn();
    return { error: "", success: "Saved." };
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT")
      throw error;
    if (!(error instanceof ForumError))
      logOperationalError("forum.action", error);
    return { error: forum.asMessage(error) };
  }
}
export async function createThreadAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  boundedForm(form);
  let id: string | undefined;
  const result = await attempt(async () => {
    id = await forum.createThread(getDb(), await currentActor(), {
      categoryId: value(form, "categoryId"),
      title: value(form, "title"),
      body: value(form, "body"),
    });
  });
  if (id) redirect(`/threads/${id}`);
  return result;
}
export async function replyAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  boundedForm(form);
  const id = String(value(form, "threadId"));
  const result = await attempt(async () =>
    forum.reply(
      getDb(),
      await currentActor(),
      id,
      value(form, "body"),
      value(form, "parentId") ? String(value(form, "parentId")) : undefined,
    ),
  );
  if (!result.error) {
    revalidatePath(`/threads/${id}`);
    redirect(`/threads/${id}`);
  }
  return result;
}
export async function editPostAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  boundedForm(form);
  const result = await attempt(async () =>
    forum.editPost(
      getDb(),
      await currentActor(),
      String(value(form, "postId")),
      value(form, "body"),
    ),
  );
  if (!result.error) revalidatePath(`/threads/${value(form, "threadId")}`);
  return result;
}
export async function profileAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  boundedForm(form);
  const result = await attempt(async () =>
    forum.updateProfile(getDb(), await currentActor(), {
      handle: value(form, "handle"),
      displayName: value(form, "displayName"),
      bio: value(form, "bio"),
    }),
  );
  if (!result.error) revalidatePath("/community");
  return result;
}
export async function categoryAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  boundedForm(form);
  const result = await attempt(async () => {
    const actor = await currentActor();
    assertAllowed(canAdmin(actor));
    const input = {
      name: value(form, "name"),
      slug: value(form, "slug"),
      description: value(form, "description"),
      sortOrder: value(form, "sortOrder"),
      archived: value(form, "archived") === "on",
    };
    const id = value(form, "id");
    if (id) await forum.updateCategory(getDb(), actor, String(id), input);
    else await forum.createCategory(getDb(), actor, input);
  });
  if (!result.error) {
    revalidatePath("/community");
    revalidatePath("/admin");
  }
  return result;
}
export async function roleAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  boundedForm(form);
  const result = await attempt(async () =>
    forum.setRole(
      getDb(),
      await currentActor(),
      String(value(form, "userId")),
      String(value(form, "role")),
    ),
  );
  if (!result.error) revalidatePath("/admin");
  return result;
}
export async function reportAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  boundedForm(form);
  return attempt(async () =>
    forum.reportContent(
      getDb(),
      await currentActor(),
      value(form, "target") === "thread" ? "thread" : "post",
      String(value(form, "id")),
      value(form, "reason"),
    ),
  );
}
export async function threadAction(form: FormData) {
  boundedForm(form);
  await forum.moderateThread(
    getDb(),
    await currentActor(),
    String(value(form, "id")),
    String(value(form, "operation")),
    value(form, "reason"),
  );
  revalidatePath("/community");
  revalidatePath(`/threads/${value(form, "id")}`);
}
export async function removePostAction(form: FormData) {
  boundedForm(form);
  await forum.removePost(
    getDb(),
    await currentActor(),
    String(value(form, "id")),
  );
  revalidatePath(`/threads/${value(form, "threadId")}`);
}
export async function reactionAction(form: FormData) {
  boundedForm(form);
  await forum.toggleReaction(
    getDb(),
    await currentActor(),
    String(value(form, "id")),
    String(value(form, "kind")),
  );
  revalidatePath(`/threads/${value(form, "threadId")}`);
}
export async function resolveReportAction(form: FormData) {
  boundedForm(form);
  const actor = await currentActor();
  assertAllowed(canModerate(actor));
  await forum.resolveReport(
    getDb(),
    actor,
    String(value(form, "id")),
    String(value(form, "status")),
    value(form, "reason"),
  );
  revalidatePath("/moderation");
}

export async function bookmarkAction(form: FormData) {
  boundedForm(form);
  const id = identifier(form.get("id"));
  await toggleBookmark(getDb(), await currentActor(), id);
  revalidatePath(`/threads/${id}`);
  revalidatePath("/bookmarks");
}
export async function readNotificationAction(form: FormData) {
  boundedForm(form);
  const actor = await currentActor();
  await markRead(
    getDb(),
    actor,
    form.get("id") ? identifier(form.get("id")) : undefined,
  );
  revalidatePath("/notifications");
}
