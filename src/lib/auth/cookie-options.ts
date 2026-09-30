import type { CookieOptions } from "@supabase/ssr";
// Auth is handled exclusively server-side. Keep PKCE verifier/access cookies
// inaccessible to browser JavaScript; use Secure on the production HTTPS origin.
export function authCookieOptions(): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.APP_ORIGIN?.startsWith("https://") ?? false,
  };
}
