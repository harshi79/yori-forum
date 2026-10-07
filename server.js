#!/usr/bin/env node
'use strict';
/*
 * Yori Forum — a self-hosted, Telegram-style forum.
 *   • "Channel" rooms: only admins can post, everyone reads
 *   • "Group" rooms: everyone can chat
 *   • Username + password auth (no email, no phone)
 *   • Live updates over Server-Sent Events (SSE)
 *   • Zero npm dependencies — plain Node.js, JSON file storage
 *
 * Run:  node server.js     (or: npm start)
 * Data: ./data/db.json (created automatically, git-ignored)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🙏'];
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const MSG_LIMIT = 4000;
const PAGE_SIZE = 50;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const now = () => Date.now();

function send(res, status, body, extraHeaders) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    extraHeaders || {}
  ));
  res.end(data);
}

function sendErr(res, status, msg) { send(res, status, { error: msg }); }

function readJson(req, res) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 200 * 1024) { sendErr(res, 413, 'Body too large'); req.destroy(); resolve(null); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { sendErr(res, 400, 'Invalid JSON body'); resolve(null); }
    });
    req.on('error', () => { sendErr(res, 400, 'Read error'); resolve(null); });
  });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(token) {
  return ['yori_session=' + token, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=31536000'].join('; ');
}

/* ------------------------------------------------------------------ */
/* Database (JSON file with debounced writes)                          */
/* ------------------------------------------------------------------ */

let db = { users: [], rooms: [], messages: [], sessions: {}, reads: {}, seq: 1 };
let saveTimer = null;

function slugify(name) {
  const s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'room';
}

function uniqueSlug(base) {
  let slug = slugify(base);
  let n = 2;
  while (db.rooms.some((r) => r.slug === slug)) slug = slugify(base) + '-' + (n++);
  return slug;
}

function makeRoom(name, type, slug, userId) {
  return {
    id: db.seq++,
    slug: slug || uniqueSlug(name),
    name,
    type, // 'channel' | 'group'
    createdBy: userId || null,
    createdAt: now()
  };
}

function sysMsg(roomId, text) {
  return { id: db.seq++, roomId, userId: 0, username: null, text, ts: now(), system: true, reactions: {} };
}

function loadDb() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = Object.assign({ users: [], rooms: [], messages: [], sessions: {}, reads: {}, seq: 1 }, parsed);
  } catch (e) { /* fresh start */ }

  // Keep the id sequence ahead of everything already stored.
  let maxId = 0;
  for (const u of db.users) maxId = Math.max(maxId, u.id);
  for (const r of db.rooms) maxId = Math.max(maxId, r.id);
  for (const m of db.messages) maxId = Math.max(maxId, m.id);
  db.seq = Math.max(db.seq, maxId + 1);

  // First boot: create the default channel + group.
  if (!db.rooms.length) {
    const channel = makeRoom('Announcements', 'channel', 'announcements', null);
    const group = makeRoom('General', 'group', 'general', null);
    db.rooms.push(channel, group);
    db.messages.push(sysMsg(channel.id, '📣 Welcome to the channel. Only admins can post here — everyone can read and react.'));
    db.messages.push(sysMsg(group.id, '💬 Welcome to the group. Everyone can chat here.'));
    saveNow();
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 300);
}

function saveNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  } catch (e) {
    console.error('[yori] failed to save database:', e.message);
  }
}

/* ------------------------------------------------------------------ */
/* Users & sessions                                                    */
/* ------------------------------------------------------------------ */

function makeUser(username, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const isFirst = db.users.length === 0;
  return {
    id: db.seq++,
    username,
    pass: { salt, hash },
    isAdmin: isFirst,   // first account = admin
    isOwner: isFirst,   // first account = owner (cannot be demoted)
    joined: now()
  };
}

function publicUser(u) {
  return { id: u.id, username: u.username, isAdmin: !!u.isAdmin, isOwner: !!u.isOwner, joined: u.joined };
}

function verifyPassword(u, password) {
  try {
    const hash = crypto.scryptSync(password, u.pass.salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(u.pass.hash, 'hex'));
  } catch (e) { return false; }
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[token] = { userId, createdAt: now() };
  return token;
}

function getSessionUser(req) {
  const token = parseCookies(req).yori_session;
  if (!token) return null;
  const sess = db.sessions[token];
  if (!sess) return null;
  return db.users.find((u) => u.id === sess.userId) || null;
}

function pubMsg(m) {
  const out = {
    id: m.id, roomId: m.roomId, userId: m.userId, username: m.username || null,
    text: m.text, ts: m.ts, system: !!m.system, reactions: m.reactions || {}
  };
  if (m.editedAt) out.editedAt = m.editedAt;
  return out;
}

/* ------------------------------------------------------------------ */
/* Live updates (SSE)                                                  */
/* ------------------------------------------------------------------ */

const clients = new Set();

function onlineIds() {
  const s = new Set();
  for (const c of clients) s.add(c.userId);
  return [...s];
}

function broadcast(ev) {
  const line = 'data: ' + JSON.stringify(ev) + '\n\n';
  for (const c of clients) {
    try { c.res.write(line); } catch (e) { /* dropped */ }
  }
}

function sseHandler(req, res) {
  const user = getSessionUser(req);
  if (!user) return sendErr(res, 401, 'Not logged in');

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  res.write('data: ' + JSON.stringify({ type: 'hello', online: onlineIds() }) + '\n\n');

  const client = { res, userId: user.id };
  clients.add(client);
  broadcast({ type: 'presence', online: onlineIds() });

  req.on('close', () => {
    clients.delete(client);
    broadcast({ type: 'presence', online: onlineIds() });
  });
}

// Heartbeat so proxies keep the stream open.
setInterval(() => {
  for (const c of clients) {
    try { c.res.write(': hb\n\n'); } catch (e) { /* ignore */ }
  }
}, 25000).unref();

/* ------------------------------------------------------------------ */
/* Rate limiting (very light)                                          */
/* ------------------------------------------------------------------ */

const msgTimes = new Map();
function allowMessage(userId) {
  const t = (msgTimes.get(userId) || []).filter((x) => now() - x < 10000);
  if (t.length >= 10) { msgTimes.set(userId, t); return false; }
  t.push(now());
  msgTimes.set(userId, t);
  return true;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function api(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  /* ---- public ---- */

  if (method === 'GET' && p === '/healthz') return send(res, 200, { ok: true });

  if (method === 'GET' && p === '/api/meta') {
    return send(res, 200, { userCount: db.users.length, rooms: db.rooms.length });
  }

  if (method === 'POST' && p === '/api/register') {
    const body = await readJson(req, res); if (body === null) return;
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!USERNAME_RE.test(username)) return sendErr(res, 400, 'Username must be 3-20 characters (letters, numbers, underscore)');
    if (password.length < 4) return sendErr(res, 400, 'Password must be at least 4 characters');
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return sendErr(res, 409, 'That username is already taken');
    }
    const user = makeUser(username, password);
    db.users.push(user);

    // A friendly join notice in the general group.
    const general = db.rooms.find((r) => r.slug === 'general') || db.rooms.find((r) => r.type === 'group');
    if (general) {
      const m = sysMsg(general.id, '🎉 ' + user.username + ' joined the forum');
      db.messages.push(m);
      broadcast({ type: 'message', roomId: general.id, message: pubMsg(m) });
    }

    const token = createSession(user.id);
    broadcast({ type: 'user', user: publicUser(user) });
    scheduleSave();
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': cookieHeader(token) });
  }

  if (method === 'POST' && p === '/api/login') {
    const body = await readJson(req, res); if (body === null) return;
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !verifyPassword(user, password)) return sendErr(res, 401, 'Wrong username or password');
    const token = createSession(user.id);
    scheduleSave();
    return send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': cookieHeader(token) });
  }

  if (method === 'GET' && p === '/api/events') return sseHandler(req, res);

  /* ---- auth required ---- */

  const user = getSessionUser(req);
  if (!user) return sendErr(res, 401, 'Not logged in');

  if (method === 'POST' && p === '/api/logout') {
    const token = parseCookies(req).yori_session;
    if (token) delete db.sessions[token];
    scheduleSave();
    return send(res, 200, { ok: true });
  }

  if (method === 'GET' && p === '/api/me') {
    return send(res, 200, { user: publicUser(user) });
  }

  if (method === 'GET' && p === '/api/bootstrap') {
    const rooms = db.rooms.map((r) => {
      const msgs = db.messages.filter((x) => x.roomId === r.id);
      const last = msgs[msgs.length - 1];
      const readTs = (db.reads[user.id] || {})[r.id] || 0;
      const unread = msgs.filter((x) => x.ts > readTs && x.userId !== user.id).length;
      return {
        id: r.id, slug: r.slug, name: r.name, type: r.type, createdAt: r.createdAt,
        unread,
        lastMessage: last ? { text: last.text, ts: last.ts, userId: last.userId, username: last.username, system: !!last.system } : null
      };
    });
    return send(res, 200, {
      me: publicUser(user),
      rooms,
      users: db.users.map(publicUser),
      online: onlineIds(),
      reactions: REACTIONS
    });
  }

  let match;

  /* ---- messages ---- */

  if (method === 'GET' && (match = p.match(/^\/api\/rooms\/(\d+)\/messages$/))) {
    const room = db.rooms.find((r) => r.id === Number(match[1]));
    if (!room) return sendErr(res, 404, 'Room not found');
    let list = db.messages.filter((m) => m.roomId === room.id);
    const before = parseInt(url.searchParams.get('before') || '0', 10);
    if (before) {
      const idx = list.findIndex((m) => m.id === before);
      if (idx > -1) list = list.slice(0, idx);
    }
    const page = list.slice(-PAGE_SIZE);
    return send(res, 200, { messages: page.map(pubMsg), hasMore: list.length > page.length });
  }

  if (method === 'POST' && (match = p.match(/^\/api\/rooms\/(\d+)\/messages$/))) {
    const room = db.rooms.find((r) => r.id === Number(match[1]));
    if (!room) return sendErr(res, 404, 'Room not found');
    if (room.type === 'channel' && !user.isAdmin) return sendErr(res, 403, 'Only admins can post in this channel');
    if (!allowMessage(user.id)) return sendErr(res, 429, 'You are sending messages too fast');
    const body = await readJson(req, res); if (body === null) return;
    const text = String(body.text || '').trim().slice(0, MSG_LIMIT);
    if (!text) return sendErr(res, 400, 'Message is empty');
    const m = { id: db.seq++, roomId: room.id, userId: user.id, username: user.username, text, ts: now(), reactions: {} };
    db.messages.push(m);
    broadcast({ type: 'message', roomId: room.id, message: pubMsg(m) });
    scheduleSave();
    return send(res, 200, { message: pubMsg(m) });
  }

  if (method === 'POST' && (match = p.match(/^\/api\/rooms\/(\d+)\/read$/))) {
    const room = db.rooms.find((r) => r.id === Number(match[1]));
    if (!room) return sendErr(res, 404, 'Room not found');
    if (!db.reads[user.id]) db.reads[user.id] = {};
    db.reads[user.id][room.id] = now();
    scheduleSave();
    return send(res, 200, { ok: true });
  }

  if (method === 'POST' && (match = p.match(/^\/api\/rooms\/(\d+)\/typing$/))) {
    const roomId = Number(match[1]);
    broadcast({ type: 'typing', roomId, userId: user.id, username: user.username });
    return send(res, 200, { ok: true });
  }

  if (method === 'DELETE' && (match = p.match(/^\/api\/messages\/(\d+)$/))) {
    const m = db.messages.find((x) => x.id === Number(match[1]));
    if (!m) return sendErr(res, 404, 'Message not found');
    if (m.userId !== user.id && !user.isAdmin) return sendErr(res, 403, 'You can only delete your own messages');
    db.messages = db.messages.filter((x) => x !== m);
    broadcast({ type: 'delete', roomId: m.roomId, messageId: m.id });
    scheduleSave();
    return send(res, 200, { ok: true });
  }

  if (method === 'PATCH' && (match = p.match(/^\/api\/messages\/(\d+)$/))) {
    const m = db.messages.find((x) => x.id === Number(match[1]));
    if (!m) return sendErr(res, 404, 'Message not found');
    if (m.userId !== user.id) return sendErr(res, 403, 'You can only edit your own messages');
    const body = await readJson(req, res); if (body === null) return;
    const text = String(body.text || '').trim().slice(0, MSG_LIMIT);
    if (!text) return sendErr(res, 400, 'Message is empty');
    m.text = text;
    m.editedAt = now();
    broadcast({ type: 'update', roomId: m.roomId, message: pubMsg(m) });
    scheduleSave();
    return send(res, 200, { message: pubMsg(m) });
  }

  if (method === 'POST' && (match = p.match(/^\/api\/messages\/(\d+)\/react$/))) {
    const m = db.messages.find((x) => x.id === Number(match[1]));
    if (!m) return sendErr(res, 404, 'Message not found');
    const body = await readJson(req, res); if (body === null) return;
    const emoji = String(body.emoji || '');
    if (!REACTIONS.includes(emoji)) return sendErr(res, 400, 'Unknown reaction');
    if (!m.reactions) m.reactions = {};
    const arr = m.reactions[emoji] || (m.reactions[emoji] = []);
    const i = arr.indexOf(user.id);
    if (i >= 0) arr.splice(i, 1); else arr.push(user.id);
    if (!arr.length) delete m.reactions[emoji];
    broadcast({ type: 'reaction', roomId: m.roomId, messageId: m.id, reactions: m.reactions });
    scheduleSave();
    return send(res, 200, { reactions: m.reactions });
  }

  /* ---- admin ---- */

  if (method === 'POST' && p === '/api/rooms' && user.isAdmin) {
    const body = await readJson(req, res); if (body === null) return;
    const name = String(body.name || '').trim().slice(0, 40);
    const type = body.type === 'channel' ? 'channel' : 'group';
    if (!name) return sendErr(res, 400, 'Name is required');
    const room = makeRoom(name, type, null, user.id);
    db.rooms.push(room);
    const m = sysMsg(room.id, type === 'channel' ? '📣 New channel created. Only admins can post here.' : '💬 New group created. Everyone can chat here.');
    db.messages.push(m);
    broadcast({ type: 'room', room, message: pubMsg(m) });
    scheduleSave();
    return send(res, 200, { room });
  }

  if (method === 'PATCH' && (match = p.match(/^\/api\/rooms\/(\d+)$/)) && user.isAdmin) {
    const room = db.rooms.find((r) => r.id === Number(match[1]));
    if (!room) return sendErr(res, 404, 'Room not found');
    const body = await readJson(req, res); if (body === null) return;
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return sendErr(res, 400, 'Name is required');
    room.name = name;
    broadcast({ type: 'room-update', room });
    scheduleSave();
    return send(res, 200, { room });
  }

  if (method === 'DELETE' && (match = p.match(/^\/api\/rooms\/(\d+)$/)) && user.isAdmin) {
    const room = db.rooms.find((r) => r.id === Number(match[1]));
    if (!room) return sendErr(res, 404, 'Room not found');
    if (db.rooms.length <= 1) return sendErr(res, 400, 'You need at least one chat');
    db.rooms = db.rooms.filter((r) => r !== room);
    db.messages = db.messages.filter((m) => m.roomId !== room.id);
    for (const uid of Object.keys(db.reads)) delete db.reads[uid][room.id];
    broadcast({ type: 'room-deleted', roomId: room.id });
    scheduleSave();
    return send(res, 200, { ok: true });
  }

  if (method === 'POST' && (match = p.match(/^\/api\/users\/(\d+)\/admin$/)) && user.isAdmin) {
    const target = db.users.find((u) => u.id === Number(match[1]));
    if (!target) return sendErr(res, 404, 'User not found');
    if (target.isOwner) return sendErr(res, 403, 'The owner cannot be changed');
    const body = await readJson(req, res); if (body === null) return;
    target.isAdmin = !!body.value;
    broadcast({ type: 'user', user: publicUser(target) });
    scheduleSave();
    return send(res, 200, { user: publicUser(target) });
  }

  if (method === 'GET' && p === '/api/admin/export' && user.isAdmin) {
    const dump = {
      app: 'yori-forum',
      exportedAt: new Date().toISOString(),
      users: db.users.map((u) => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, isOwner: !!u.isOwner, joined: u.joined })),
      rooms: db.rooms,
      messages: db.messages.map(pubMsg)
    };
    return send(res, 200, JSON.stringify(dump, null, 2), {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="yori-forum-backup.json"'
    });
  }

  return sendErr(res, 404, 'Not found');
}

/* ------------------------------------------------------------------ */
/* Static files (SPA fallback)                                         */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendErr(res, 405, 'Method not allowed');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { return sendErr(res, 400, 'Bad path'); }
  if (p === '/') p = '/index.html';

  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) return sendErr(res, 403, 'Forbidden');

  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) {
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(file).pipe(res);
    } else {
      // SPA fallback: /r/anything → index.html
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      fs.createReadStream(path.join(PUBLIC_DIR, 'index.html')).pipe(res);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

loadDb();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error('[yori] error:', e);
    if (!res.headersSent) sendErr(res, 500, 'Server error');
    try { res.end(); } catch (e2) { /* ignore */ }
  }
});

server.listen(PORT, HOST, () => {
  console.log('[yori] Yori Forum is running on http://' + HOST + ':' + PORT);
  console.log('[yori] The FIRST account you register becomes the admin.');
});

function shutdown() {
  saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
