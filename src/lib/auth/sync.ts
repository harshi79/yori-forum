import "server-only";
import { eq, and } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";
import { getDb } from "@/db/client";
import { authIdentities, users } from "@/db/schema";

// Atomic idempotent provisioning. Handles concurrent first visits without deriving trust from metadata.
export async function syncAuthUser(authUser: User) {
  const db = getDb();
  const provider = "supabase";
  const identity = await db.query.authIdentities.findFirst({
    where: and(
      eq(authIdentities.provider, provider),
      eq(authIdentities.providerUserId, authUser.id),
    ),
  });
  if (identity) return identity.userId;

  // Stable, collision-resistant default handle; users can choose a display handle later.
  const id = crypto.randomUUID();
  const handle = `member-${authUser.id.replaceAll("-", "").slice(0, 24)}`;
  await db.insert(users).values({ id, handle }).onConflictDoNothing();
  await db
    .insert(authIdentities)
    .values({
      id: crypto.randomUUID(),
      userId: id,
      provider,
      providerUserId: authUser.id,
    })
    .onConflictDoNothing();
  const mapped = await db.query.authIdentities.findFirst({
    where: and(
      eq(authIdentities.provider, provider),
      eq(authIdentities.providerUserId, authUser.id),
    ),
  });
  if (!mapped) throw new Error("Unable to provision forum user");
  // In a concurrent race the losing provisional user may be left behind; clean it up.
  if (mapped.userId !== id) await db.delete(users).where(eq(users.id, id));
  return mapped.userId;
}
