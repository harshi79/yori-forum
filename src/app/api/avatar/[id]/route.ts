import { eq, isNull, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { avatarBucket } from "@/lib/forum/avatar";
import { identifier } from "@/lib/forum/validation";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = identifier((await params).id);
    const user = await getDb().query.users.findFirst({
      where: and(eq(users.id, id), isNull(users.deletedAt)),
    });
    if (!user?.avatarUrl?.startsWith(`avatars/${id}/`))
      return new Response(null, { status: 404 });
    const object = await (await avatarBucket())?.get(user.avatarUrl);
    if (!object) return new Response(null, { status: 404 });
    const contentType = object.httpMetadata?.contentType;
    if (!["image/png", "image/jpeg", "image/webp"].includes(contentType ?? ""))
      return new Response(null, { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": contentType!,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
