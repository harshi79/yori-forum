# Public-launch checklist

**Manual actions, not verified by local/CI tests.** Record an owner, date and evidence for each item before inviting users. Follow [operations](operations.md) for detailed recovery procedures.

- [ ] Configure production Supabase Site URL, an exact HTTPS `/auth/callback` redirect allowlist, Email OTP/magic links, verified SMTP sender, OTP expiry and Supabase-side rate/abuse limits. Remove development/wildcard redirects from production.
- [ ] Create the production Turso database and scoped token. Create an encrypted pre-launch backup; apply all committed migrations with `npm run db:migrate` from a trusted shell, then check table counts, `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.
- [ ] Sign in as the intended first administrator and bootstrap that **verified** Supabase identity's forum user ID using the trusted DB-console SQL in README. Verify the admin UI; do not expose a web bootstrap route.
- [ ] Create private R2 bucket `yori-avatars` and verify the `AVATARS` binding and bucket name in `wrangler.jsonc`; never add a public bucket domain.
- [ ] Set build-time **public** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` and matching Worker runtime variables. Set Worker **secrets** `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_ORIGIN` (exact HTTPS origin, no trailing slash); set optional `RATE_*` overrides only after reviewing defaults. Do not place service-role credentials in the app.
- [ ] Configure the Cloudflare custom HTTPS domain, DNS, certificate and HTTPS redirect; confirm the domain equals `APP_ORIGIN` and the Supabase redirect allowlist. Enable HSTS only after verifying HTTPS and redirects.
- [ ] Deploy with `npm run cf:build && npm run cf:deploy`; verify the deployed Worker, static assets, private pages, security headers and that production secrets do not appear in logs or responses.
- [ ] Complete a real production/staging mailbox magic-link send, callback, protected-route and sign-out test on the final domain. Verify Secure, HttpOnly and SameSite cookies in the browser.
- [ ] Upload, view, replace and remove a small valid avatar against the bound production/staging R2 bucket; confirm unauthorized/oversized files are refused and the bucket stays private.
- [ ] Configure external probes for `/api/health` (including alerting on 503 and latency), Cloudflare Worker errors, Turso availability and Supabase mail delivery. Confirm paging/contact ownership and log retention.
- [ ] Export a fresh encrypted Turso backup and a separate private R2 avatar backup. Restore both to **disposable** infrastructure, verify integrity/counts/avatar linkage, and record recovery time before claiming backup readiness.
