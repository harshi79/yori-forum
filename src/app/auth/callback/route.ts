import { authCookieOptions } from "@/lib/auth/cookie-options";
import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getDb } from "@/db/client";
import { limit, fingerprint, RateLimitError } from "@/lib/forum/rate";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  // Never accept an arbitrary redirect destination from the callback URL.
  const destination = new URL("/community", request.url);
  if (!code)
    return NextResponse.redirect(
      new URL("/login?error=missing-code", request.url),
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.redirect(new URL("/login?error=config", request.url));
  try {
    await limit(
      getDb(),
      "login",
      `callback:${await fingerprint(request.headers.get("cf-connecting-ip") ?? "unverified")}`,
    );
  } catch (e) {
    if (e instanceof RateLimitError)
      return new NextResponse("Too many sign-in attempts", {
        status: 429,
        headers: { "Retry-After": String(e.retryAfter) },
      });
    throw e;
  }
  const response = NextResponse.redirect(destination);
  const supabase = createServerClient(url, key, {
    cookieOptions: authCookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (
        items: { name: string; value: string; options: CookieOptions }[],
      ) =>
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        ),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error)
    return NextResponse.redirect(new URL("/login?error=callback", request.url));
  return response;
}
