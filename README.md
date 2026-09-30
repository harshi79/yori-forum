# Yori Forum

A lightweight community forum. Next.js App Router + TypeScript + Tailwind CSS on Cloudflare Workers, Supabase **Auth only**, and Turso/libSQL + Drizzle for all application data.

## Requirements

Node.js 22+, npm, a Supabase project, a Turso database, and (for deployment) a Cloudflare account with Wrangler authentication.

## Local development

1. `npm ci`
2. Copy `.env.example` to `.env.local` and replace all placeholders. Keep this file private.
3. In Supabase Authentication → URL Configuration, set your Site URL to `http://localhost:3000` and allow redirect URL `http://localhost:3000/auth/callback`. Enable Email OTP / magic links. Add production origin + `/auth/callback` before deploying.
4. `npm run db:migrate` (reads `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from the shell; the Drizzle CLI does **not** auto-load `.env.local`). For example: `set -a; . ./.env.local; set +a; npm run db:migrate` if your file is shell-compatible. Alternatively export both variables in your terminal.
5. `npm run dev` and visit http://localhost:3000. The landing page works without credentials; login requires Supabase and Turso; public `/community` requires Turso and uses Supabase only when a visitor is signed in. Set `APP_ORIGIN=http://localhost:3000` for local login.

Generate SQL after schema changes with `npm run db:generate`, inspect the new migration in `drizzle/`, then run `npm run db:migrate`. Commit schema and migration together. `npm run typecheck`, `npm run lint`, and `npm run build` validate the application. Use `npm run format` to apply Prettier.

## Deployment (Cloudflare Workers)

1. Create a Turso database and a limited-scope database token; migrate the **production** database from a trusted terminal/CI using `npm run db:migrate` before deploying.
2. Configure Supabase's production Site URL and allow `https://YOUR_DOMAIN/auth/callback` as a redirect URL.
3. Authenticate with `npx wrangler login`. Set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `APP_ORIGIN` (the exact public origin) as Worker secrets using `npx wrangler secret put NAME`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in build environment **and** Worker runtime environment; these two values are intentionally public. Do not set Turso values with a `NEXT_PUBLIC_` prefix. For local Worker preview copy `.dev.vars.example` to `.dev.vars` and fill it in; this file is ignored.
4. Run `npm run cf:build`, then `npm run cf:preview` to test the Worker locally, or `npm run cf:deploy` to deploy with OpenNext and `wrangler.jsonc`. Build-time public variables must be supplied when building (e.g. through CI environment). If you use a custom domain, update the Supabase redirect allowlist.

Cloudflare's `nodejs_compat` flag is required by the OpenNext adapter. Database requests use `@libsql/client/web` (HTTP transport), not native SQLite or a Node TCP connection. Never use a Supabase service-role key or Supabase database for forum data.

## Data and security model

`users` are forum profiles, `auth_identities` maps a verified Supabase Auth user ID to a forum user ID. `/community` checks Supabase `getUser()` server-side, then provisions an idempotent mapping in Turso. Supabase owns login cookies/tokens; `sessions` is reserved for optional app-side session metadata and is not currently populated. Middleware refreshes auth cookies and redirects anonymous visitors; the server page checks auth again before provisioning. No client-side Turso access exists. Mutations verify auth and role server-side; public routes only read visible content. `updated_at` is initialized on insert; future writes must update it explicitly. Soft deletion (`deleted_at`) preserves discussion history.

Public pages can render without secrets. The private page will show a retryable error if Turso is unavailable. Treat migration review, backups, Cloudflare WAF, and monitoring as deployment responsibilities before inviting users.

## Core forum (second migration)

Apply `drizzle/0001_known_christian_walker.sql` via `npm run db:migrate` before using the new pages. Public browse: `/community` → category → thread, plus `/u/HANDLE`. Authenticated members may create threads, reply, react, report and edit/remove their replies within **30 minutes** (`EDIT_WINDOW_MINUTES` in `src/lib/forum/permissions.ts`). Moderators can lock/pin/archive/remove threads, edit/remove posts and resolve reports at `/moderation`. Admins additionally manage categories (including display order and archive) and roles at `/admin`. First-post removal is disallowed; archive its thread instead. Posts are plain text, rendered escaped by React, not HTML/Markdown. Archived categories/threads are hidden from public views. Edited posts have private previous-body rows in `post_edits` (not publicly exposed).

**Bootstrap admin:** sign in once, then from a trusted DB console find the user ID in `auth_identities` by your verified Supabase user ID; execute `INSERT INTO roles (id, name) VALUES ('admin', 'admin') ON CONFLICT DO NOTHING; UPDATE users SET role_id = 'admin' WHERE id = '<verified-forum-user-id>';` after verifying the intended ID. Do not add a public admin-registration route. Subsequent role changes are restricted to admins server-side; admins cannot change their own role. Categories are admin-only (moderators handle content/reports, not site structure).

Views are counted through a lightweight POST from the thread page, with a 30-minute first-party cookie and tab-local throttling; this is best-effort, not anti-fraud analytics. Avatar initials are used when no R2 avatar is configured. For tests use `npm test`, which runs integration tests on temporary local libSQL databases against committed migrations. A database-backed rate limiter now covers posting, reporting, views and other sensitive operations (see below). Production monitoring and a recovery workflow remain necessary.

## Notifications, search, bookmarks, and avatars (third stage)

Apply the **committed migrations 0002, 0003 and 0004 in order** (`npm run db:migrate`) before using this release. Notifications are written in the same database transaction as their forum event. Thread authors and a directly replied-to post's author receive one reply notification each, plus new unique mentions for other recipients; no self-notifications. Moderation actions and report outcomes also notify affected members. `/notifications` is private, paginated, and has per-user read actions; the header refreshes unread count once a minute while visible. `/bookmarks` is private and paginated. `/search` is public, paginated, escaped/parameterized, and excludes archived/deleted threads and categories. Search currently uses bounded SQL `LIKE` on visible threads and correlated posts/authors rather than FTS; on large datasets, evaluate Turso FTS5/trigram indexes in a subsequent stage.

### Rate limits and abuse control

`src/lib/forum/rate.ts` maintains atomic fixed-window counters in Turso; there is no isolate-local counter, Redis, or extra paid service. Defaults include login (5/hour per CF client IP **and** email address), threads (5/hour), replies (20/hour), edits (20/hour), reports (5/hour), reactions (60/hour), bookmarks (40/hour), searches (30/minute), and avatars (6/hour). Mention generation is capped at 20 unique users per post and is subject to thread/reply/edit limits. Duplicate thread/reply/report submissions with identical content from the same account are blocked for 60 seconds. Configure each limit with `RATE_<ACTION>_MAX` and `RATE_<ACTION>_WINDOW_SECONDS` (positive integers, at most 86400); see all actions in `rate.ts`. Identity keys for email/IP are SHA-256 fingerprints. Expired rows are opportunistically pruned; schedule periodic cleanup if volume warrants it. HTTP API endpoints return 429 and `Retry-After`; server-action forms show the retry message. Login emails are now sent from a rate-limited **server action** (not directly from the browser). Set `APP_ORIGIN` to the trusted absolute origin, e.g. `https://forum.example.com` (no trailing slash), both in the build/runtime where needed; for local Next development use `http://localhost:3000`. Configure Supabase Auth's own email/OTP rate limits as well: the public Supabase anon key can call Supabase Auth directly, outside the app's limits. On Cloudflare, `CF-Connecting-IP` is provided by the ingress; without it anonymous traffic shares a conservative fallback bucket. Use Cloudflare WAF rules for large-scale attacks.

Forum form submissions are capped at 85 KB, validated individually by the service, and rendered as React-escaped plain text. View POSTs are rate-limited. For form actions Next.js enforces same-origin server actions; avatar uploads also verify Origin explicitly. Avatar raw streams are capped at 1 MB server-side; oversized or malformed images are rejected.

### Cloudflare R2 avatars

Create a **private** R2 bucket named `yori-avatars` in the Cloudflare account: `npx wrangler r2 bucket create yori-avatars`. `wrangler.jsonc` binds it as `AVATARS`. No public R2 bucket URL is needed: `/api/avatar/[id]` is an image-only proxy that looks up the currently attached object key from the user's Turso profile. Users upload/replace/remove only their own avatar from `/profile`; keys are generated by the server (never original filenames), types must match PNG/JPEG/WebP magic bytes and Content-Type, and output has `nosniff` and restrictive CSP headers. Unconfigured bindings return 503 and initial-based placeholders remain usable. Run `npm run cf:preview` for local R2 emulation, or configure OpenNext Wrangler development context for `next dev`; uploads depend on the `AVATARS` binding. Review R2 storage lifecycle/orphan cleanup if uploads are interrupted by a deployment failure; keep this bucket private. Set `APP_ORIGIN` for each preview/production hostname to allow magic links to return to the correct domain. R2 object deletion after replacement is best effort.

Moderation at `/moderation` includes open/resolved reports, target excerpts, reporters, recent audit records with actors/timestamps/reasons, and archived-thread restore controls. Moderation events are audited in `moderation_records`; public pages never query the audit or reports tables. Existing admin bootstrap and role boundaries still apply.
