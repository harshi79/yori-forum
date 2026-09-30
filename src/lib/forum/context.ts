import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { syncAuthUser } from "@/lib/auth/sync";
import type { Actor, Role } from "./permissions";

export async function currentActor(): Promise<Actor> {
  const auth = await requireAuth();
  const id = await syncAuthUser(auth);
  const profile = await getDb().query.users.findFirst({
    where: eq(users.id, id),
    with: { role: true },
  });
  if (!profile || profile.deletedAt) throw new Error("Account unavailable");
  const role = profile.role?.name;
  return {
    id,
    role: role === "admin" || role === "moderator" ? (role as Role) : "user",
  };
}
export async function optionalActor(): Promise<Actor | null> {
  // Public pages need not provision accounts or access Supabase if unconfigured.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return null;
  const { createSupabaseServerClient } = await import("@/lib/auth/server");
  const {
    data: { user },
  } = await (await createSupabaseServerClient()).auth.getUser();
  if (!user) return null;
  const id = await syncAuthUser(user);
  const profile = await getDb().query.users.findFirst({
    where: eq(users.id, id),
    with: { role: true },
  });
  if (!profile || profile.deletedAt) return null;
  return {
    id,
    role:
      profile.role?.name === "admin"
        ? "admin"
        : profile.role?.name === "moderator"
          ? "moderator"
          : "user",
  };
}
