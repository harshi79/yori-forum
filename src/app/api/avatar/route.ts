import { eq, and, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { optionalActor } from "@/lib/forum/context";
import {
  avatarBucket,
  avatarKey,
  MAX_AVATAR_BYTES,
  readAvatar,
} from "@/lib/forum/avatar";
import { limit, RateLimitError } from "@/lib/forum/rate";
import { ForumError } from "@/lib/forum/permissions";
import { isSameOrigin } from "@/lib/forum/origin";
function sameOrigin(request: NextRequest) {
  return isSameOrigin(
    request.headers.get("origin"),
    request.headers.get("host"),
  );
}
function errorResponse(error: unknown) {
  const status =
    error instanceof RateLimitError
      ? 429
      : error instanceof ForumError
        ? 400
        : 503;
  return NextResponse.json(
    {
      error:
        error instanceof ForumError
          ? error.message
          : "Avatar storage unavailable",
    },
    {
      status,
      headers:
        error instanceof RateLimitError
          ? { "Retry-After": String(error.retryAfter) }
          : {},
    },
  );
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  if (Number(request.headers.get("content-length")) > MAX_AVATAR_BYTES + 1024)
    return new NextResponse(null, { status: 413 });
  try {
    const actor = await optionalActor();
    if (!actor)
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const db = getDb();
    await limit(db, "avatar", actor.id);
    const bucket = await avatarBucket();
    if (!bucket)
      return NextResponse.json(
        { error: "Avatar storage is not configured" },
        { status: 503 },
      );
    const { bytes, type } = await readAvatar(request);
    const key = avatarKey(actor.id, type);
    await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
    try {
      const previous = await db.query.users.findFirst({
        where: eq(users.id, actor.id),
      });
      if (!previous) throw new Error("Account unavailable");
      const changed = await db
        .update(users)
        .set({ avatarUrl: key, updatedAt: new Date() })
        .where(
          and(
            eq(users.id, actor.id),
            previous.avatarUrl
              ? eq(users.avatarUrl, previous.avatarUrl)
              : isNull(users.avatarUrl),
          ),
        )
        .returning({ id: users.id });
      if (!changed.length)
        throw new ForumError("Avatar changed elsewhere. Please retry.");
      if (previous.avatarUrl?.startsWith(`avatars/${actor.id}/`))
        await bucket.delete(previous.avatarUrl).catch(() => {});
    } catch (e) {
      await bucket.delete(key).catch(() => {});
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  try {
    const actor = await optionalActor();
    if (!actor)
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const db = getDb();
    await limit(db, "avatar", actor.id);
    const bucket = await avatarBucket();
    if (!bucket)
      return NextResponse.json(
        { error: "Avatar storage is not configured" },
        { status: 503 },
      );
    const user = await db.query.users.findFirst({
      where: eq(users.id, actor.id),
    });
    const changed = await db
      .update(users)
      .set({ avatarUrl: null, updatedAt: new Date() })
      .where(
        and(
          eq(users.id, actor.id),
          user?.avatarUrl
            ? eq(users.avatarUrl, user.avatarUrl)
            : isNull(users.avatarUrl),
        ),
      )
      .returning({ id: users.id });
    if (!changed.length)
      throw new ForumError("Avatar changed elsewhere. Please retry.");
    if (user?.avatarUrl?.startsWith(`avatars/${actor.id}/`))
      await bucket.delete(user.avatarUrl).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
