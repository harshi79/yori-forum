import { NextResponse, type NextRequest } from "next/server";
import { eq, isNull, and, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { threads } from "@/db/schema";
import { identifier } from "@/lib/forum/validation";
import { ForumError } from "@/lib/forum/permissions";
import { isSameOrigin } from "@/lib/forum/origin";
import { limit, fingerprint, RateLimitError } from "@/lib/forum/rate";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (
      request.headers.get("origin") &&
      !isSameOrigin(request.headers.get("origin"), request.headers.get("host"))
    )
      return new NextResponse(null, { status: 403 });
    const id = identifier((await params).id);
    if (request.cookies.get("yori_recent_view")?.value === id)
      return new NextResponse(null, { status: 204 });
    const db = getDb();
    try {
      await limit(
        db,
        "view",
        `ip:${await fingerprint(request.headers.get("cf-connecting-ip") ?? "unverified")}`,
      );
    } catch (e) {
      if (e instanceof RateLimitError)
        return new NextResponse(null, {
          status: 429,
          headers: { "Retry-After": String(e.retryAfter) },
        });
      throw e;
    }
    const rows = await db
      .update(threads)
      .set({ viewCount: sql`${threads.viewCount} + 1` })
      .where(
        and(
          eq(threads.id, id),
          isNull(threads.deletedAt),
          isNull(threads.archivedAt),
        ),
      )
      .returning({ id: threads.id });
    if (!rows.length) return new NextResponse(null, { status: 404 });
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set("yori_recent_view", id, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 1800,
      path: "/",
    });
    return response;
  } catch (e) {
    return new NextResponse(null, {
      status: e instanceof ForumError ? 400 : 503,
    });
  }
}
