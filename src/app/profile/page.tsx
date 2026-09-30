import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { currentActor } from "@/lib/forum/context";
import { Header, Shell } from "@/components/forum";
import { ProfileForm } from "@/components/forms";
import { AvatarUpload } from "@/components/avatar-upload";
import { Avatar } from "@/components/avatar";
export const dynamic = "force-dynamic";
export default async function ProfilePage() {
  const actor = await currentActor();
  const profile = await getDb().query.users.findFirst({
    where: eq(users.id, actor.id),
  });
  if (!profile) return null;
  return (
    <>
      <Header actor={actor} />
      <Shell>
        <h1 className="mb-8 text-3xl font-semibold">Your profile</h1>
        <p className="mb-6 text-slate-400">
          Public page:{" "}
          <Link className="text-violet-300" href={`/u/${profile.handle}`}>
            @{profile.handle}
          </Link>
        </p>
        <div className="max-w-xl">
          <Avatar
            id={profile.id}
            name={profile.displayName ?? profile.handle}
            stored={profile.avatarUrl}
            size={72}
          />
          <AvatarUpload />
          <div className="mt-8" />
          <ProfileForm
            handle={profile.handle}
            displayName={profile.displayName}
            bio={profile.bio}
          />
        </div>
      </Shell>
    </>
  );
}
