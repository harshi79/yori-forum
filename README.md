# Yori Forum 🗨️

Your own **Telegram-style forum** that nobody can ban — a channel where only admins post, plus a group where everyone chats. No email, no phone number, no personal ID: people just pick a **username + password** and they're in.

Built with **zero dependencies** (plain Node.js) so it runs on any free host.

## What you get

| | |
|---|---|
| 📣 **Channel** | Admin-only posting (like a TG channel). Everyone reads + reacts. |
| 💬 **Group** | Everyone chats, like a normal group chat. |
| 👤 **Simple auth** | Username + password only. Passwords are scrypt-hashed. |
| 🔗 **Direct join links** | Share `https://your-site.com/r/announcements` — like a `t.me/` link. |
| ⚡ **Live updates** | New messages, reactions, typing indicators, online status — instantly (SSE, with polling fallback). |
| 🔔 **Unread badges** | Per-chat unread counts, "new messages" pill, title counter. |
| 😀 **Reactions** | 👍 ❤️ 😂 🔥 😮 😢 🙏 on any message. |
| ✏️ **Edit / delete** | Edit your messages, delete yours (admins can delete any). |
| 👑 **Admin panel** | First registered account = owner. Promote/demote admins, create/rename/delete chats. |
| 🌓 **Dark + light** | Telegram-style dark theme by default, light mode toggle. |
| 📱 **Mobile-ready** | Responsive with a slide-out chat list — feels like an app. |
| 💾 **Backup** | One-click JSON export of all users/chats/messages. |

## Run it (10 seconds)

Requires Node.js 18+ (no `npm install` needed — there are no dependencies!):

```bash
node server.js
```

Open `http://localhost:3000`.

> 👑 **The FIRST account you register becomes the admin (owner).**
> Register yourself first, then share the link with your people.

Your data lives in `data/db.json` (created automatically, never committed to git).

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |

## How to use it like Telegram

1. **Register first** → you become the owner/admin.
2. You get two chats out of the box:
   - **Announcements** (channel) — only you and other admins can post. Everyone else reads & reacts.
   - **General** (group) — everyone can talk.
3. **Invite people**: tap the 🔗 share button in the chat header (or Chat info → Invite link) and send them the link, exactly like a `t.me/` invite. They register with username+password and land straight in the chat.
4. Make more channels/groups anytime in the **Admin panel** (⚙️ in the sidebar).
5. Promote trusted people to admin so they can also post in channels.

## Free deployment

Because there are zero dependencies and it's a single small Node process, it fits in every free tier:

### Option A — Oracle Cloud "Always Free" (best: free forever + persistent disk)
1. Create a free account at [cloud.oracle.com](https://www.oracle.com/cloud/free/) (always-free ARM VM included).
2. Install Node.js, upload this folder, run `node server.js` behind their included reverse proxy or `sudo apt install nginx`.

### Option B — Render.com (easiest)
1. Push this repo to GitHub.
2. On [render.com](https://render.com) → **New → Web Service** → pick the repo (a `render.yaml` is included).
3. Build command: *(nothing)* · Start command: `node server.js` · Instance: **Free**.

⚠️ **Free-host warning:** free tiers usually have an *ephemeral disk* — when the service restarts/redeploys, `data/db.json` resets. If you use a free tier, download a backup from the Admin panel regularly. For permanent storage use Oracle (above), a paid disk ($1/mo on Render), or any cheap/free VPS.

### Option C — Any VPS / home server / Termux
```bash
node server.js
```
That's it. Put it behind nginx or Caddy if you want HTTPS.

## Backup & restore

- **Backup**: Admin panel → *Download data backup* (JSON with users, chats, messages).
- **Restore**: replace `data/db.json` with your backup file and restart.

## Security notes

- Passwords: scrypt + per-user random salt, constant-time compare.
- Sessions: 256-bit random tokens, HttpOnly cookies.
- All user content is HTML-escaped; links are sanitized.
- Basic rate-limiting on messages.
- This is a small self-hosted forum: great for a community of friends/followers. Don't run a 10k-user public platform on a JSON file. 🙂

## Project structure

```
server.js          # whole backend: HTTP + API + SSE + JSON storage (~600 lines)
public/index.html  # app shell
public/style.css   # Telegram-style UI (dark + light)
public/app.js      # frontend logic (no framework)
data/db.json       # your data (auto-created, git-ignored)
```
