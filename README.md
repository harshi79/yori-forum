# yori

A small self-hosted forum that works like Telegram. Two chats, fixed: **YoriMethods** (channel) and **Yori Chat** (group). People sign up with just a username and password — no email, no phone number.

Runs on plain Node.js with zero dependencies. No database server, no build step. Data lives in a single JSON file.

## Run it

```
node server.js
```

Open `http://localhost:3000`.

**The first account you register becomes the owner.** Register yourself before sharing the link with anyone.

## How it works

**Structure (fixed — there is exactly one channel and one group):**

- **YoriMethods** — channel. Only the owner and admins can post. Everyone else reads and reacts.
- **Yori Chat** — group. Everyone posts. Every new channel post is auto-forwarded here and pinned at the top; the previous pinned post becomes a normal message (nothing is deleted).

**Reactions:**

- Everyone can react, in the channel or on the forwarded copy in the group — counts are shared and identical in both places.
- One reaction per user per post. Picking a different emoji moves your reaction.

**Admins:**

- Admins can post in the channel.
- Only the owner can add or remove admins. The owner is the first registered account and cannot be demoted.

**Usernames:**

- 5–20 characters, letters, numbers, underscore.
- The name `Yori` (any capitalization — yori/Yori/YORI are the same) is reserved for the first account. Case-insensitive everywhere.

**Messages:**

- Emoji shortcodes: type `:fire:` `:omg:` `:100:` `:tada:` etc. — an autocomplete pops up while typing, or use the emoji button next to the input. Around 80 shortcodes available.
- Links are clickable. Emoji-only messages render big.
- Right-click a message for copy text / copy link / react / edit / delete. Double-click to ❤️.
- Every message has a shareable link (`/r/yorimethods?m=123`) — copying it from the right-click menu and opening it jumps straight to that message.

**Live:** new messages, reactions, pins, typing indicators and online status arrive instantly (SSE, with polling fallback).

**Admin panel:** members list, add/remove admins (owner only), download a JSON backup.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |

Data is stored in `data/db.json`. The folder is created automatically and git-ignored.

## Deploying on Botkeep

Works on the free plan — one slot is plenty.

1. Push this repo to GitHub (or download it as a ZIP).
2. In Botkeep, create a **Node.js** workload.
3. Import the repo (GitHub) or upload the ZIP.
4. Start command: `node server.js` (or `npm start`).
5. Suggested resources: 256 MB RAM, 10% CPU, 256 MB storage.
6. Start the server. Register your account first — it becomes the owner.

Health check path if you want one: `/healthz`.

Notes:

- The app binds to `0.0.0.0` and respects `PORT`, so it fits any container-style host.
- Backups: Admin panel → Data → **Download backup (JSON)**. Do this regularly. A backup plus a fresh deploy gets you running again anywhere.
- Restoring: replace `data/db.json` with your backup file and restart.

## Deploying elsewhere

Anywhere Node.js 18+ runs: Render, Railway, Koyeb, Fly, a VPS, or even Termux. Same start command. A `render.yaml` is included if you use Render.

Free hosts with ephemeral disks will lose `data/db.json` on redeploy — keep backups, or use a host with persistent storage.

## Security

- Passwords hashed with scrypt and a per-user salt.
- Sessions are 256-bit random tokens in HttpOnly cookies.
- All user input is escaped; links are sanitized to http(s).
- Simple rate limiting on messages.
- Right user, right scale: a JSON file store is meant for communities of friends and followers, not thousands of concurrent users.

## License

MIT. The bundled Manrope font is under the SIL Open Font License (`public/fonts/OFL.txt`).
