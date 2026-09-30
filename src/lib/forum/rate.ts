import { sql, lt } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { ForumError } from "./permissions";
type Db = ReturnType<typeof getDb>;
export class RateLimitError extends ForumError {
  constructor(public retryAfter: number) {
    super(`Too many requests. Try again in ${retryAfter} seconds.`);
  }
}
const defaults = {
  duplicate: [1, 60],
  login: [5, 3600],
  thread: [5, 3600],
  reply: [20, 3600],
  edit: [20, 3600],
  reaction: [60, 3600],
  report: [5, 3600],
  search: [30, 60],
  bookmark: [40, 3600],
  avatar: [6, 3600],
  notification: [120, 3600],
  profile: [10, 3600],
  moderation: [60, 3600],
  category: [30, 3600],
  view: [60, 3600],
} as const;
export type RateAction = keyof typeof defaults;
// Env values only adjust limits, never disable them. Stable account/IP keys, not process-local state.
export async function limit(
  db: Db,
  action: RateAction,
  identity: string,
  at = Date.now(),
) {
  const [defaultMax, defaultWindow] = defaults[action];
  const max = readInt(`RATE_${action.toUpperCase()}_MAX`, defaultMax);
  const windowSeconds = readInt(
    `RATE_${action.toUpperCase()}_WINDOW_SECONDS`,
    defaultWindow,
  );
  const time = Math.floor(at / 1000);
  const bucket = Math.floor(time / windowSeconds);
  const key = `${action}:${identity}:${bucket}`;
  const expires = (bucket + 1) * windowSeconds;
  const result = await db
    .insert(rateLimits)
    .values({ key, count: 1, expiresAt: expires })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  // Opportunistic pruning: approximately once per 256 requests per isolate.
  if (crypto.getRandomValues(new Uint8Array(1))[0] === 0)
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.expiresAt, time - 3600))
      .catch(() => {});
  if (result[0].count > max)
    throw new RateLimitError(Math.max(1, expires - time));
}
function readInt(key: string, fallback: number) {
  const value = Number(process.env[key]);
  return Number.isSafeInteger(value) && value >= 1 && value <= 86400
    ? value
    : fallback;
}

export async function deduplicate(
  db: Db,
  actorId: string,
  scope: string,
  content: string,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${scope}:${content}`),
  );
  const hash = Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  await limit(db, "duplicate", `${actorId}:${hash}`);
}

// Hash private identifiers before storing rate keys in Turso.
export async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
