# Yori Forum

A lightweight community forum foundation. Next.js App Router + TypeScript + Tailwind CSS on Cloudflare Workers, Supabase **Auth only**, and Turso/libSQL + Drizzle for all application data.

## Requirements

Node.js 22+, npm, a Supabase project, a Turso database, and (for deployment) a Cloudflare account with Wrangler authentication.

## Local development

1. `npm ci`
2. Copy `.env.example` to `.env.local` and replace all placeholders. Keep this file private.
3. In Supabase Authentication → URL Configuration, set your Site URL to `http://localhost:3000` and allow redirect URL `http://localhost:3000/auth/callback`. Enable Email OTP / magic links. Add production origin + `/auth/callback` before deploying.
4. `npm run db:migrate` (reads `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` from the shell; the Drizzle CLI does **not** auto-load `.env.local`). For example: `set -a; . ./.env.local; set +a; npm run db:migrate` if your file is shell-compatible. Alternatively export both variables in your terminal.
5. `npm run dev` and visit http://localhost:3000. The landing page works without credentials; login and `/community` require Supabase, and provisioning also requires Turso.

Generate SQL after schema changes with `npm run db:generate`, inspect the new migration in `drizzle/`, then run `npm run db:migrate`. Commit schema and migration together. `npm run typecheck`, `npm run lint`, and `npm run build` validate the application. Use `npm run format` to apply Prettier.

## Deployment (Cloudflare Workers)

1. Create a Turso database and a limited-scope database token; migrate the **production** database from a trusted terminal/CI using `npm run db:migrate` before deploying.
2. Configure Supabase's production Site URL and allow `https://YOUR_DOMAIN/auth/callback` as a redirect URL.
3. Authenticate with `npx wrangler login`. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as Worker secrets using `npx wrangler secret put NAME`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in build environment **and** Worker runtime environment; these two values are intentionally public. Do not set Turso values with a `NEXT_PUBLIC_` prefix. For local Worker preview copy `.dev.vars.example` to `.dev.vars` and fill it in; this file is ignored.
4. Run `npm run cf:build`, then `npm run cf:preview` to test the Worker locally, or `npm run cf:deploy` to deploy with OpenNext and `wrangler.jsonc`. Build-time public variables must be supplied when building (e.g. through CI environment). If you use a custom domain, update the Supabase redirect allowlist.

Cloudflare's `nodejs_compat` flag is required by the OpenNext adapter. Database requests use `@libsql/client/web` (HTTP transport), not native SQLite or a Node TCP connection. Never use a Supabase service-role key or Supabase database for forum data.

## Data and security model

`users` are forum profiles, `auth_identities` maps a verified Supabase Auth user ID to a forum user ID. `/community` checks Supabase `getUser()` server-side, then provisions an idempotent mapping in Turso. Supabase owns login cookies/tokens; `sessions` is reserved for optional app-side session metadata and is not currently populated. Middleware refreshes auth cookies and redirects anonymous visitors; the server page checks auth again before provisioning. No client-side Turso access exists. Forum write endpoints, roles/permissions, moderation flows, and content features are intentionally not yet implemented. For any future endpoint, re-check auth and enforce authorization server-side. `updated_at` is initialized on insert; future writes must update it explicitly. Soft deletion (`deleted_at`) preserves discussion history.

Public pages can render without secrets. The private page will show a retryable error if Turso is unavailable. Treat migration review, backups, rate limits, abuse protection, and monitoring as deployment responsibilities before inviting users.

## Core forum (second migration)

Apply `drizzle/0001_known_christian_walker.sql` via `npm run db:migrate` before using the new pages. Public browse: `/community` → category → thread, plus `/u/HANDLE`. Authenticated members may create threads, reply, react, report and edit/remove their replies within **30 minutes** (`EDIT_WINDOW_MINUTES` in `src/lib/forum/permissions.ts`). Moderators can lock/pin/archive/remove threads, edit/remove posts and resolve reports at `/moderation`. Admins additionally manage categories (including display order and archive) and roles at `/admin`. First-post removal is disallowed; archive its thread instead. Posts are plain text, rendered escaped by React, not HTML/Markdown. Archived categories/threads are hidden from public views. Edited posts have private previous-body rows in `post_edits` (not publicly exposed).

**Bootstrap admin:** sign in once, then from a trusted DB console find the user ID in `auth_identities` by your verified Supabase user ID; execute `INSERT INTO roles (id, name) VALUES ('admin', 'admin') ON CONFLICT DO NOTHING; UPDATE users SET role_id = 'admin' WHERE id = '<verified-forum-user-id>';` after verifying the intended ID. Do not add a public admin-registration route. Subsequent role changes are restricted to admins server-side; admins cannot change their own role. Categories are admin-only (moderators handle content/reports, not site structure).

Views are counted through a lightweight POST from the thread page, with a 30-minute first-party cookie and tab-local throttling; this is best-effort, not anti-fraud analytics. Avatar storage is not configured: profile initials are used instead. For tests use `npm test`, which runs integration tests on temporary local libSQL databases against committed migrations. Configure abuse prevention / rate limiting for posting, reporting and view counting before a public launch; follow up with audit/recovery tooling for moderators, URL-safe image storage, and production monitoring. Existing notifications/search/bookmarks are reserved for later work.
