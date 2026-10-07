#!/usr/bin/env node
'use strict';
/*
 * yori — a small self-hosted forum that works like Telegram.
 *   • Fixed structure: one channel (YoriMethods) + one group (Yori Chat)
 *   • Channel: only the owner and admins can post; everyone can react
 *   • Channel posts auto-forward to the group and get pinned there
 *   • Reactions are shared between the channel post and its group copy
 *   • One reaction per user per post (switching emojis moves it)
 *   • Only the owner can promote/demote admins
 *   • Username "Yori" is reserved for the first account (case-insensitive);
 *     everyone else needs 5-20 characters
 *   • Live updates over SSE, zero npm dependencies, JSON file storage
 *
 * Run:  node server.js   (or: npm start)
 * Data: ./data/db.json (created automatically, git-ignored)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const net = require('net');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '😢', '🙏'];
const USERNAME_RE = /^[a-zA-Z0-9_]{5,20}$/;   // everyone except the reserved name
const RESERVED_NAME = 'yori';                  // only the first account may take it
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

  // Migrate old default rooms to the new fixed names.
  const ann = db.rooms.find((r) => r.slug === 'announcements');
  if (ann) { ann.name = 'YoriMethods'; ann.slug = 'yorimethods'; }
  const gen = db.rooms.find((r) => r.slug === 'general');
  if (gen) { gen.name = 'Yori Chat'; gen.slug = 'yori-chat'; }
  for (const room of db.rooms) {
    if (typeof room.description !== 'string') room.description = '';
    if (typeof room.photoUrl !== 'string') room.photoUrl = '';
  }

  // First boot: create the fixed channel + group.
  if (!db.rooms.length) {
    const channel = {
      id: db.seq++, slug: 'yorimethods', name: 'YoriMethods', type: 'channel',
      createdBy: null, createdAt: now(), pinnedMsgId: null, description: '', photoUrl: ''
    };
    const group = {
      id: db.seq++, slug: 'yori-chat', name: 'Yori Chat', type: 'group',
      createdBy: null, createdAt: now(), pinnedMsgId: null, description: '', photoUrl: ''
    };
    db.rooms.push(channel, group);
    db.messages.push(sysMsg(channel.id, 'Only admins can post here. Everyone can read and react.'));
    db.messages.push(sysMsg(group.id, 'Everyone can post here. Channel posts arrive here automatically and stay pinned at the top.'));
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

const findChannel = () => db.rooms.find((r) => r.type === 'channel') || null;
const findGroup = () => db.rooms.find((r) => r.type === 'group') || null;

function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    const ipHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || net.isIP(ipHost)) return false;
    return true;
  } catch (e) { return false; }
}

function isSafeImageUrl(value) {
  if (!isSafeExternalUrl(value)) return false;
  try {
    const ext = new URL(value).pathname.split('.').pop().toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].includes(ext);
  } catch (e) { return false; }
}

function pubRoom(room) {
  return {
    id: room.id, slug: room.slug, name: room.name, type: room.type,
    createdAt: room.createdAt, description: room.description || '', photoUrl: room.photoUrl || ''
  };
}

function pubLastMessage(message) {
  if (!message) return null;
  return {
    id: message.id, text: message.text, ts: message.ts, userId: message.userId,
    username: message.username || null, system: !!message.system, fromChannel: !!message.fromChannel
  };
}

function lastMessageInRoom(roomId) {
  for (let i = db.messages.length - 1; i >= 0; i--) {
    if (db.messages[i].roomId === roomId) return pubLastMessage(db.messages[i]);
  }
  return null;
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
    isAdmin: isFirst,   // first account = owner
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
    text: m.text, ts: m.ts, system: !!m.system, reactions: m.reactions || {},
    fromChannel: !!m.fromChannel, linkedTo: m.linkedTo || null
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

function broadcastPin(room) {
  if (!room || !room.pinnedMsgId) {
    if (room) broadcast({ type: 'pin', roomId: room.id, pinned: null });
    return;
  }
  const m = db.messages.find((x) => x.id === room.pinnedMsgId);
  broadcast({ type: 'pin', roomId: room.id, pinned: m ? { id: m.id, text: m.text } : null });
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
/* Message helpers                                                     */
/* ------------------------------------------------------------------ */

// Copies of a channel post living in the group.
const copiesOf = (id) => db.messages.filter((m) => m.linkedTo === id);

// Group forwards are only views of the channel post. Administrative actions on
// a forward always resolve to its channel original so every copy stays in sync.
function messageOrigin(m) {
  if (m && m.linkedTo) return db.messages.find((x) => x.id === m.linkedTo) || m;
  return m;
}

// Reacting on a group copy targets the channel original, so reactions stay shared.
function reactionTarget(m) {
  if (m.linkedTo) {
    const orig = db.messages.find((x) => x.id === m.linkedTo);
    if (orig) return orig;
  }
  return m;
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
    if (username.toLowerCase() === RESERVED_NAME) {
      if (db.users.length > 0) return sendErr(res, 403, 'That name is reserved');
    } else if (!USERNAME_RE.test(username)) {
      return sendErr(res, 400, 'Username must be 5-20 characters (letters, numbers, underscore)');
    }
    if (password.length < 4) return sendErr(res, 400, 'Password must be at least 4 characters');
    if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      return sendErr(res, 409, 'That username is already taken');
    }
    const user = makeUser(username, password);
    db.users.push(user);

    // A join notice in the group.
    const group = findGroup();
    if (group) {
      const m = sysMsg(group.id, user.username + ' joined');
      db.messages.push(m);
      broadcast({ type: 'message', roomId: group.id, message: pubMsg(m) });
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
      const pinnedMsg = r.pinnedMsgId ? db.messages.find((x) => x.id === r.pinnedMsgId) : null;
      return {
        ...pubRoom(r),
        unread,
        pinned: pinnedMsg ? { id: pinnedMsg.id, text: pinnedMsg.text } : null,
        lastMessage: pubLastMessage(last)
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

  // Room identity is plain metadata: pictures are hosted elsewhere and only
  // their HTTPS URLs are kept in this JSON database.
  if (method === 'PATCH' && (match = p.match(/^\/api\/rooms\/(\d+)$/))) {
    const room = db.rooms.find((r) => r.id === Number(match[1]));
    if (!room) return sendErr(res, 404, 'Room not found');
    if (room.type !== 'channel' && room.type !== 'group') return sendErr(res, 400, 'This room cannot be customized');
    if (!user.isAdmin) return sendErr(res, 403, 'Only admins can change room details');
    const body = await readJson(req, res); if (body === null) return;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendErr(res, 400, 'Invalid room details');

    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name || name.length > 48) return sendErr(res, 400, 'Room name must be 1-48 characters');
      room.name = name;
    }
    if (body.description !== undefined) {
      const description = String(body.description || '').trim();
      if (description.length > 500) return sendErr(res, 400, 'Room description must be 500 characters or fewer');
      room.description = description;
    }
    if (body.photoUrl !== undefined) {
      const photoUrl = String(body.photoUrl || '').trim();
      if (photoUrl && !isSafeImageUrl(photoUrl)) {
        return sendErr(res, 400, 'Room picture must be a public HTTPS image link (JPG, PNG, GIF, WebP, or AVIF)');
      }
      room.photoUrl = photoUrl;
    }

    const published = pubRoom(room);
    broadcast({ type: 'room', room: published });
    scheduleSave();
    return send(res, 200, { room: published });
  }

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

    // Channel posts auto-forward to the group and pin there.
    if (room.type === 'channel') {
      const group = findGroup();
      if (group && group.id !== room.id) {
        const copy = {
          id: db.seq++, roomId: group.id, userId: user.id, username: user.username,
          text, ts: m.ts, reactions: m.reactions, linkedTo: m.id, fromChannel: true
        };
        db.messages.push(copy);
        group.pinnedMsgId = copy.id; // older messages stay, only the pin moves
        broadcast({ type: 'message', roomId: group.id, message: pubMsg(copy) });
        broadcastPin(group);
      }
    }

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
    const requested = db.messages.find((x) => x.id === Number(match[1]));
    if (!requested) return sendErr(res, 404, 'Message not found');
    const m = messageOrigin(requested);
    const sourceRoom = db.rooms.find((r) => r.id === m.roomId);
    const isChannelPost = !!sourceRoom && sourceRoom.type === 'channel';
    if (isChannelPost ? !user.isAdmin : (m.userId !== user.id && !user.isAdmin)) {
      return sendErr(res, 403, isChannelPost ? 'Only channel admins can delete channel posts' : 'You can only delete your own messages');
    }

    // Deleting a channel post removes its group copies too.
    const removed = [m].concat(copiesOf(m.id));
    db.messages = db.messages.filter((x) => !removed.includes(x));

    // Clear the pin if a pinned message was removed.
    for (const room of db.rooms) {
      if (room.pinnedMsgId && removed.some((x) => x.id === room.pinnedMsgId)) {
        room.pinnedMsgId = null;
        broadcastPin(room);
      }
    }
    const affectedRooms = new Set(removed.map((x) => x.roomId));
    for (const x of removed) {
      broadcast({ type: 'delete', roomId: x.roomId, messageId: x.id, lastMessage: lastMessageInRoom(x.roomId) });
    }
    for (const roomId of affectedRooms) broadcastPin(db.rooms.find((r) => r.id === roomId));
    scheduleSave();
    return send(res, 200, { ok: true });
  }

  if (method === 'PATCH' && (match = p.match(/^\/api\/messages\/(\d+)$/))) {
    const requested = db.messages.find((x) => x.id === Number(match[1]));
    if (!requested) return sendErr(res, 404, 'Message not found');
    const m = messageOrigin(requested);
    const sourceRoom = db.rooms.find((r) => r.id === m.roomId);
    const isChannelPost = !!sourceRoom && sourceRoom.type === 'channel';
    if (isChannelPost ? !user.isAdmin : m.userId !== user.id) {
      return sendErr(res, 403, isChannelPost ? 'Only channel admins can edit channel posts' : 'You can only edit your own messages');
    }
    const body = await readJson(req, res); if (body === null) return;
    const text = String(body.text || '').trim().slice(0, MSG_LIMIT);
    if (!text) return sendErr(res, 400, 'Message is empty');
    m.text = text;
    m.editedAt = now();

    // Edits to a channel post propagate to every group copy.
    const copies = copiesOf(m.id);
    for (const c of copies) {
      c.text = text;
      c.editedAt = m.editedAt;
      broadcast({ type: 'update', roomId: c.roomId, message: pubMsg(c) });
    }
    broadcast({ type: 'update', roomId: m.roomId, message: pubMsg(m) });
    for (const room of db.rooms) {
      if (room.pinnedMsgId === m.id || copies.some((copy) => room.pinnedMsgId === copy.id)) broadcastPin(room);
    }
    scheduleSave();
    return send(res, 200, { message: pubMsg(m) });
  }

  if (method === 'POST' && (match = p.match(/^\/api\/messages\/(\d+)\/react$/))) {
    const m = db.messages.find((x) => x.id === Number(match[1]));
    if (!m) return sendErr(res, 404, 'Message not found');
    const body = await readJson(req, res); if (body === null) return;
    const emoji = String(body.emoji || '');
    if (!REACTIONS.includes(emoji)) return sendErr(res, 400, 'Unknown reaction');

    // Reacting on the group copy targets the channel original; reactions stay shared.
    const target = reactionTarget(m);
    if (!target.reactions) target.reactions = {};
    const had = (target.reactions[emoji] || []).includes(user.id);

    // One reaction per user per post: pull the user off every emoji first.
    for (const e of Object.keys(target.reactions)) {
      target.reactions[e] = target.reactions[e].filter((id) => id !== user.id);
      if (!target.reactions[e].length) delete target.reactions[e];
    }
    if (!had) target.reactions[emoji] = (target.reactions[emoji] || []).concat(user.id);

    // Keep every copy in sync (same counts shown in the channel and the group).
    const syncd = [target].concat(copiesOf(target.id));
    for (const c of syncd) c.reactions = target.reactions;
    for (const x of syncd) {
      broadcast({ type: 'reaction', roomId: x.roomId, messageId: x.id, reactions: target.reactions });
    }
    scheduleSave();
    return send(res, 200, { reactions: target.reactions });
  }

  /* ---- owner only ---- */

  if (method === 'POST' && (match = p.match(/^\/api\/users\/(\d+)\/admin$/))) {
    if (!user.isOwner) return sendErr(res, 403, 'Only the owner can manage admins');
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
      app: 'yori',
      exportedAt: new Date().toISOString(),
      users: db.users.map((u) => ({ id: u.id, username: u.username, isAdmin: u.isAdmin, isOwner: !!u.isOwner, joined: u.joined })),
      rooms: db.rooms,
      messages: db.messages.map(pubMsg)
    };
    return send(res, 200, JSON.stringify(dump, null, 2), {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="yori-backup.json"'
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
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendErr(res, 405, 'Method not allowed');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { return sendErr(res, 400, 'Bad path'); }
  if (p === '/') p = '/index.html';

  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== PUBLIC_DIR) return sendErr(res, 403, 'Forbidden');

  fs.readFile(file, (err, buf) => {
    if (err) {
      // SPA fallback: /r/anything → index.html
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, index) => {
        if (err2) return sendErr(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(index);
      });
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isFont = ext === '.ttf' || ext === '.woff2';
    const headers = {
      'Content-Type': type,
      'Cache-Control': isFont ? 'public, max-age=31536000, immutable' : 'no-cache'
    };
    // gzip text responses when the client accepts it
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) &&
        /^(text\/|application\/(json|javascript|manifest\+json))/.test(type)) {
      try {
        buf = zlib.gzipSync(buf);
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
      } catch (e) { /* send uncompressed */ }
    }
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : buf);
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
  console.log('[yori] running on http://' + HOST + ':' + PORT + ' — first registered account becomes the admin');
});

function shutdown() {
  saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
