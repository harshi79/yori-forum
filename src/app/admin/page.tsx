import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { categories } from "@/db/schema";
import { currentActor } from "@/lib/forum/context";
import { assertAllowed, canAdmin } from "@/lib/forum/permissions";
import { Header, Shell } from "@/components/forum";
import { CategoryForm, RoleForm } from "@/components/forms";
export const dynamic = "force-dynamic";
export default async function Admin() {
  const actor = await currentActor();
  assertAllowed(canAdmin(actor));
  const list = await getDb().query.categories.findMany({
    orderBy: asc(categories.sortOrder),
  });
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <h1 className="mb-8 text-4xl font-semibold">Shape the spaces</h1>
        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryForm />
          {list.map((c) => (
            <CategoryForm key={c.id} category={c} />
          ))}
        </div>
        <div className="mt-12 max-w-xl">
          <h2 className="mb-4 text-xl">Roles</h2>
          <p className="mb-4 text-sm text-slate-400">
            Find forum user IDs on moderation records or in Turso. Grant
            moderator/admin deliberately. The initial admin must be assigned via
            a trusted one-time database operation; never via signup.
          </p>
          <RoleForm />
        </div>
      </Shell>
    </>
  );
}
