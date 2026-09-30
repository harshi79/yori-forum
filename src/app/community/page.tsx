import Link from "next/link";
import { asc, eq, isNull, and, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories, threads } from "@/db/schema";
import { optionalActor } from "@/lib/forum/context";
import { Empty, Header, Shell, panel } from "@/components/forum";
export const dynamic = "force-dynamic";
export default async function Community() {
  const actor = await optionalActor();
  const db = getDb();
  const list = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      count: sql<number>`count(${threads.id})`,
    })
    .from(categories)
    .leftJoin(
      threads,
      and(
        eq(threads.categoryId, categories.id),
        isNull(threads.deletedAt),
        isNull(threads.archivedAt),
      ),
    )
    .where(isNull(categories.archivedAt))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <div className="mb-12">
          <p className="mb-3 text-sm uppercase tracking-[0.2em] text-violet-300">
            Welcome to Yori
          </p>
          <h1 className="text-5xl font-semibold tracking-tight">
            Find your corner of the conversation.
          </h1>
          <p className="mt-5 max-w-xl text-slate-400">
            A calmer space to ask, share, and keep good ideas close.
          </p>
        </div>
        <h2 className="mb-5 text-xl font-semibold">Spaces</h2>
        {list.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((c) => (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                className={`${panel} block transition hover:border-violet-400/50 hover:bg-white/[0.06]`}
              >
                <div className="mb-5 text-2xl text-violet-300">✳</div>
                <h3 className="text-xl font-semibold">{c.name} →</h3>
                <p className="mt-2 min-h-12 text-slate-400">
                  {c.description ?? "A space for the community."}
                </p>
                <p className="mt-4 text-xs text-slate-500">
                  {c.count} discussions
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <Empty>No spaces yet. Check back soon.</Empty>
        )}
      </Shell>
    </>
  );
}
