// Compare browser Origin with the actual request Host. Next.js may normalize
// request.nextUrl.origin to localhost behind a trusted reverse proxy.
export function isSameOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host === host
    );
  } catch {
    return false;
  }
}
