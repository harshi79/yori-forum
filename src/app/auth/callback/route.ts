import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  const response = NextResponse.redirect(destination);
  const supabase = createServerClient(url, key, {
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
