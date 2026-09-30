import { NextResponse, type NextRequest } from "next/server";
import { eq, isNull, and, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { threads } from "@/db/schema";
import { identifier } from "@/lib/forum/validation";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = identifier((await params).id);
    if (request.cookies.get("yori_recent_view")?.value === id)
      return new NextResponse(null, { status: 204 });
    const rows = await getDb()
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
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
