"use server";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { field } from "@/lib/forum/validation";
import { ForumError } from "@/lib/forum/permissions";
import { limit, fingerprint, RateLimitError } from "@/lib/forum/rate";
import { boundedForm } from "@/lib/forum/requests";
export type LoginState = { message: string };
export async function requestMagicLink(
  _: LoginState,
  form: FormData,
): Promise<LoginState> {
  try {
    boundedForm(form);
    const email = field(form.get("email"), "Email", 5, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new ForumError("Enter a valid email address");
    const h = await headers();
    const ip = h.get("cf-connecting-ip") ?? "unverified";
    const db = getDb();
    await limit(db, "login", `ip:${await fingerprint(ip)}`);
    // Secondary per-address limit prevents distributed abuse of a single inbox.
    await limit(db, "login", `email:${await fingerprint(email)}`);
    const supabase = await createSupabaseServerClient();
    // Origin must come from trusted config, not Host / X-Forwarded-Host headers.
    const origin = process.env.APP_ORIGIN;
    if (
      !origin ||
      !/^https?:\/\/[^/]+$/.test(origin) ||
      (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))
    )
      throw new Error("APP_ORIGIN missing");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) throw error;
    return { message: "If that address can sign in, a link is on its way." };
  } catch (e) {
    return {
      message:
        e instanceof RateLimitError
          ? e.message
          : e instanceof ForumError
            ? e.message
            : "Sign-in is temporarily unavailable. Please try later.",
    };
  }
}
