// Compare browser Origin with the actual request Host. Next.js may normalize
// request.nextUrl.origin to localhost behind a trusted reverse proxy.
export function isSameOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    const configured = process.env.APP_ORIGIN;
    // Production requests to the canonical host must originate from its HTTPS
    // scheme too; same-host HTTP is not the same browser origin as HTTPS.
    if (configured && new URL(configured).host === host)
      return parsed.origin === configured;
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host === host
    );
  } catch {
    return false;
  }
}
