import { eq, and, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { optionalActor } from "@/lib/forum/context";
import { Header, Shell, DateLabel, panel } from "@/components/forum";
import { Avatar } from "@/components/avatar";
export const dynamic = "force-dynamic";
export default async function PublicProfile({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const db = getDb(),
    handle = (await params).handle;
  const profile = await db.query.users.findFirst({
    where: and(eq(users.handle, handle), isNull(users.deletedAt)),
    with: { role: true },
  });
  if (!profile) notFound();
  const [[stats], actor] = await Promise.all([
    db
      .select({
        threads: sql<number>`(select count(*) from threads where author_id = ${profile.id} and deleted_at is null and archived_at is null)`,
        posts: sql<number>`(select count(*) from posts where author_id = ${profile.id} and deleted_at is null)`,
      })
      .from(users)
      .where(eq(users.id, profile.id)),
    optionalActor(),
  ]);
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <div className={panel}>
          <Avatar
            id={profile.id}
            name={profile.displayName ?? profile.handle}
            stored={profile.avatarUrl}
            size={80}
          />
          <h1 className="mt-6 text-4xl font-semibold">
            {profile.displayName ?? profile.handle}
          </h1>
          <p className="mt-2 text-violet-300">
            @{profile.handle} · {profile.role?.name ?? "member"}
          </p>
          <p className="mt-5 max-w-xl whitespace-pre-wrap text-slate-300">
            {profile.bio ?? "Here for the conversation."}
          </p>
          <p className="mt-6 text-sm text-slate-500">
            Joined <DateLabel date={profile.createdAt} /> · {stats.threads}{" "}
            threads · {stats.posts} posts
          </p>
        </div>
      </Shell>
    </>
  );
}
