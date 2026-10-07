# yori

A small self-hosted forum that works like Telegram. One channel where only admins post, one group where everyone talks. People sign up with just a username and password — no email, no phone number, no accounts on anyone else's platform.

Runs on plain Node.js with zero dependencies. No database server, no build step. Data lives in a single JSON file.

## Run it

```
node server.js
```

That's it. Open `http://localhost:3000`.

**The first account you register becomes the owner.** Register yourself before sharing the link with anyone.

## How it works

- **Channel** — only admins can post. Everyone else reads and reacts. Like a Telegram channel.
- **Group** — everyone posts. Like a Telegram group.
- Invite links look like `https://your-domain.com/r/announcements` — same idea as a `t.me/` link. Anyone who signs in through the link lands directly in that chat.
- New messages, reactions, typing and online status arrive live (SSE, with polling fallback).
- Admins manage everything from the panel: promote/demote admins, create, rename and delete chats, download a backup.

Two chats are created on first start: `Announcements` (channel) and `General` (group). Rename or delete them from the admin panel.

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
5. Suggested resources: 256 MB RAM, 10% CPU, 256 MB storage. That comfortably runs a small community.
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
