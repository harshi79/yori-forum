'use strict';
/*
 * yori — frontend
 * No frameworks, no build step.
 */
(() => {

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayKey = (ts) => new Date(ts).toDateString();

  function fmtDay(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yest = new Date(Date.now() - 864e5);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }

  function shortTime(ts) {
    const d = new Date(ts);
    if (d.toDateString() === new Date().toDateString()) return fmtTime(ts);
    if (Date.now() - ts < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }

  const PALETTE = ['#d5787e', '#7bb662', '#d4b95e', '#61a5dd', '#a08fdc', '#dd7ba3', '#e09a5f', '#63b8ba'];
  function colorFor(name) {
    let h = 0;
    const s = String(name || '?');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function initials(name) {
    const parts = String(name || '?').trim().split(/[\s_-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || '?').slice(0, 1).toUpperCase();
  }

  function renderText(text) {
    return esc(text)
      .replace(/(https?:\/\/[^\s<]+)/g, (url) => '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>')
      .replace(/\n/g, '<br>');
  }

  function isEmojiOnly(t) {
    const stripped = String(t).replace(/[\u200d\ufe0f\u{1f3fb}-\u{1f3ff}\s]/gu, '');
    const chars = Array.from(stripped);
    if (!chars.length || chars.length > 6) return false;
    return chars.every((c) => /\p{Extended_Pictographic}/u.test(c));
  }

  async function api(path, opts) {
    opts = opts || {};
    const init = { method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
      init.headers['Content-Type'] = 'application/json';
    }
    const r = await fetch(path, init);
    let data = {};
    try { data = await r.json(); } catch (e) { /* empty */ }
    if (!r.ok) throw new Error(data.error || 'Request failed (' + r.status + ')');
    return data;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); }
      catch (e) { reject(e); }
      finally { ta.remove(); }
    });
  }

  const ICONS = {
    smile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
  };

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */

  const state = {
    me: null,
    rooms: [],
    users: new Map(),
    online: new Set(),
    reactions: ['👍', '❤️', '😂', '🔥', '😮', '😢', '🙏'],
    activeRoomId: null,
    messages: [],
    hasMore: false,
    loadingOlder: false,
    atBottom: true,
    editing: null,
    typing: {},
    initialSlug: null,
    suppressAnim: false
  };

  let es = null;
  let pollTimer = null;
  let currentModal = null;
  let readTimer = null;
  let lastTypingSent = 0;
  let toastTimer = null;
  let emojiPopFor = null;
  let ctxMenu = null;

  const activeRoom = () => state.rooms.find((r) => r.id === state.activeRoomId) || null;
  const canPost = (room) => !!room && (room.type !== 'channel' || !!(state.me && state.me.isAdmin));

  /* ---------------------------------------------------------------- */
  /* Toast                                                             */
  /* ---------------------------------------------------------------- */

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------------------------------------------------------------- */
  /* Auth                                                              */
  /* ---------------------------------------------------------------- */

  let authMode = 'login';

  function showAuth() {
    $('#auth').classList.remove('hidden');
    $('#app').classList.add('hidden');
  }

  function setAuthMode(mode) {
    authMode = mode;
    const login = mode === 'login';
    $('#authSub').textContent = login ? 'Sign in to continue' : 'Create an account';
    $('#authSubmit').textContent = login ? 'Sign in' : 'Create account';
    $('#authPass').setAttribute('autocomplete', login ? 'current-password' : 'new-password');
    $('#authAltText').textContent = login ? 'New here?' : 'Already have an account?';
    $('#authToggle').textContent = login ? 'Create an account' : 'Sign in';
    $('#authError').textContent = '';
    if (!login) {
      api('/api/meta').then((m) => {
        $('#authNote').textContent = m.userCount === 0
          ? 'You are the first user — this account becomes the admin.'
          : 'Accounts need only a username and password.';
      }).catch(() => {});
    } else {
      $('#authNote').textContent = 'Accounts need only a username and password.';
    }
  }

  async function submitAuth(e) {
    e.preventDefault();
    const btn = $('#authSubmit');
    const username = $('#authUser').value.trim();
    const password = $('#authPass').value;
    $('#authError').textContent = '';
    if (!username || !password) { $('#authError').textContent = 'Enter a username and password'; return; }
    btn.disabled = true;
    btn.textContent = authMode === 'login' ? 'Signing in…' : 'Creating account…';
    try {
      const r = await api('/api/' + authMode, { method: 'POST', body: { username, password } });
      state.me = r.user;
      enterApp();
    } catch (err) {
      $('#authError').textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.textContent = authMode === 'login' ? 'Sign in' : 'Create account';
    }
  }

  /* ---------------------------------------------------------------- */
  /* Bootstrap & rooms                                                 */
  /* ---------------------------------------------------------------- */

  async function enterApp() {
    $('#auth').classList.add('hidden');
    $('#app').classList.remove('hidden');
    applyTheme(document.documentElement.dataset.theme || 'dark');
    await loadBootstrap();
    connectSSE();
    const slug = state.initialSlug;
    const room = slug && state.rooms.find((r) => r.slug === slug);
    if (slug && !room) toast('That link points to a chat that was removed');
    openRoom(room ? room.id : state.rooms[0].id, { history: 'replace' });
  }

  async function loadBootstrap() {
    const b = await api('/api/bootstrap');
    state.me = b.me;
    state.rooms = b.rooms;
    state.users = new Map(b.users.map((u) => [u.id, u]));
    state.online = new Set(b.online);
    if (b.reactions) state.reactions = b.reactions;
    renderSidebar();
  }

  function openRoom(id, opts) {
    opts = opts || {};
    const room = state.rooms.find((r) => r.id === id);
    if (!room) return;
    state.activeRoomId = id;
    state.editing = null;
    cancelEditUI();
    renderSidebar();
    renderHeader();
    renderComposer();
    loadMessages(id);
    if (opts.history !== false) {
      history[opts.history === 'replace' ? 'replaceState' : 'pushState']({}, '', '/r/' + room.slug);
    }
    closeSidebar();
    closeCtxMenu();
    if (window.matchMedia('(pointer: fine)').matches) $('#input') && $('#input').focus();
  }

  async function loadMessages(id) {
    try {
      const r = await api('/api/rooms/' + id + '/messages');
      if (state.activeRoomId !== id) return;
      state.messages = r.messages;
      state.hasMore = r.hasMore;
      renderMessages({ scroll: 'bottom' });
      markRead(true);
    } catch (e) {
      toast(e.message);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sidebar                                                           */
  /* ---------------------------------------------------------------- */

  function previewText(room, lm) {
    if (!lm) return 'No messages';
    if (lm.system) return lm.text;
    const prefix = lm.userId === state.me.id ? 'You: '
      : (room.type === 'group' && lm.username ? lm.username + ': ' : '');
    let t = (prefix + String(lm.text)).replace(/\n/g, ' ');
    if (t.length > 44) t = t.slice(0, 44) + '…';
    return t;
  }

  function renderSidebar() {
    const list = $('#roomList');
    const q = ($('#searchInput').value || '').toLowerCase();
    list.innerHTML = '';
    for (const room of state.rooms) {
      if (q && !room.name.toLowerCase().includes(q) && !room.slug.includes(q)) continue;
      const item = document.createElement('div');
      item.className = 'room-item' + (room.id === state.activeRoomId ? ' active' : '');
      item.innerHTML =
        '<div class="room-avatar" style="background:' + colorFor(room.name) + '">' + esc(initials(room.name)) + '</div>' +
        '<div class="room-body">' +
          '<div class="room-top"><span class="room-name">' + esc(room.name) + '</span>' +
          '<span class="room-time">' + (room.lastMessage ? esc(shortTime(room.lastMessage.ts)) : '') + '</span></div>' +
          '<div class="room-bottom"><span class="room-preview">' + esc(previewText(room, room.lastMessage)) + '</span>' +
          (room.unread ? '<span class="badge">' + (room.unread > 99 ? '99+' : room.unread) + '</span>' : '') +
          '</div>' +
        '</div>';
      item.addEventListener('click', () => openRoom(room.id));
      list.appendChild(item);
    }

    const me = state.me;
    $('#meCard').innerHTML =
      '<div class="avatar" style="background:' + colorFor(me.username) + '">' + esc(initials(me.username)) + '</div>' +
      '<div style="min-width:0"><div class="me-name">' + esc(me.username) + '</div>' +
      (me.isAdmin ? '<div class="me-chip">' + (me.isOwner ? 'owner' : 'admin') + '</div>' : '') + '</div>';
    $('#adminBtn').classList.toggle('hidden', !me.isAdmin);

    const total = state.rooms.reduce((a, r) => a + (r.unread || 0), 0);
    document.title = (total ? '(' + total + ') ' : '') + 'yori';
  }

  /* ---------------------------------------------------------------- */
  /* Header & composer                                                 */
  /* ---------------------------------------------------------------- */

  function renderHeader() {
    const room = activeRoom();
    if (!room) return;
    const av = $('#headAvatar');
    av.textContent = initials(room.name);
    av.style.background = colorFor(room.name);
    $('#headName').innerHTML = esc(room.name) + '<span class="type-tag">' + (room.type === 'channel' ? 'channel' : 'group') + '</span>';
    const word = room.type === 'channel' ? 'subscriber' + (state.users.size === 1 ? '' : 's') : 'member' + (state.users.size === 1 ? '' : 's');
    $('#headSub').innerHTML = esc(state.users.size + ' ' + word) + ' · <span class="on">' + state.online.size + ' online</span>';
  }

  function renderComposer() {
    const room = activeRoom();
    if (!room) return;
    const allowed = canPost(room);
    $('#mutedBar').classList.toggle('hidden', allowed);
    $('#composerRow').classList.toggle('hidden', !allowed);
  }

  /* ---------------------------------------------------------------- */
  /* Messages                                                          */
  /* ---------------------------------------------------------------- */

  function dayDividerEl(ts) {
    const d = document.createElement('div');
    d.className = 'day-divider';
    d.innerHTML = '<span>' + esc(fmtDay(ts)) + '</span>';
    return d;
  }

  function reactionsHtml(m) {
    if (!m.reactions) return '';
    const keys = Object.keys(m.reactions).filter((k) => (m.reactions[k] || []).length);
    if (!keys.length) return '';
    let h = '<div class="reactions">';
    for (const emoji of keys) {
      const users = m.reactions[emoji];
      const mine = users.includes(state.me.id);
      h += '<button class="react-pill' + (mine ? ' mine' : '') + '" data-emoji="' + esc(emoji) + '" title="React ' + esc(emoji) + '">' +
        esc(emoji) + '<span class="cnt">' + users.length + '</span></button>';
    }
    return h + '</div>';
  }

  function toolsHtml(m) {
    if (m.system) return '';
    const mine = m.userId === state.me.id;
    let h = '<button class="tool-btn react-btn" title="React">' + ICONS.smile + '</button>';
    if (mine) h += '<button class="tool-btn edit-btn" title="Edit">' + ICONS.pencil + '</button>';
    if (mine || state.me.isAdmin) h += '<button class="tool-btn del-btn" title="Delete">' + ICONS.trash + '</button>';
    return '<div class="msg-tools">' + h + '</div>';
  }

  function messageEl(m, prev) {
    const row = document.createElement('div');

    if (m.system) {
      row.className = 'msg-row sys no-anim';
      row.dataset.id = m.id;
      const s = document.createElement('div');
      s.className = 'sysmsg';
      s.innerHTML = renderText(m.text);
      row.appendChild(s);
      return row;
    }

    const mine = m.userId === state.me.id;
    const room = activeRoom();
    const grouped = prev && !prev.system && prev.userId === m.userId && (m.ts - prev.ts) < 300000;
    const user = state.users.get(m.userId) || { username: m.username || 'user', isAdmin: false };
    const big = isEmojiOnly(m.text);

    row.className = 'msg-row' + (mine ? ' mine' : '') + (state.suppressAnim ? ' no-anim' : '');
    row.dataset.id = m.id;

    let avatarHtml = '';
    if (!mine && !grouped) {
      avatarHtml = '<div class="avatar" style="background:' + colorFor(user.username) + '">' + esc(initials(user.username)) + '</div>';
    }
    let nameHtml = '';
    if (!mine && !grouped && room && room.type === 'group') {
      nameHtml = '<div class="msg-name" style="color:' + colorFor(user.username) + '">' + esc(user.username) +
        (user.isAdmin ? '<span class="admin-chip">admin</span>' : '') + '</div>';
    }

    const bodyHtml =
      '<div class="bubble' + (grouped ? '' : ' tail') + (big ? ' big' : '') + '">' +
        nameHtml +
        '<div class="msg-text">' + (big ? esc(m.text) : renderText(m.text)) + '</div>' +
        '<div class="msg-foot"><span class="msg-meta">' +
          (m.editedAt ? '<span class="edited">edited</span>' : '') + esc(fmtTime(m.ts)) +
        '</span></div>' +
        reactionsHtml(m) +
        toolsHtml(m) +
      '</div>';

    row.innerHTML = avatarHtml + bodyHtml;
    return row;
  }

  function renderMessages(opts) {
    opts = opts || {};
    const list = $('#messages');
    const oldTop = list.scrollTop;
    const oldHeight = list.scrollHeight;

    state.suppressAnim = true;
    list.innerHTML = '';
    if (!state.messages.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No messages yet';
      list.appendChild(empty);
    } else {
      let prev = null;
      for (const m of state.messages) {
        if (!prev || dayKey(prev.ts) !== dayKey(m.ts)) list.appendChild(dayDividerEl(m.ts));
        list.appendChild(messageEl(m, prev));
        prev = m;
      }
    }
    state.suppressAnim = false;

    if (opts.scroll === 'bottom') {
      list.scrollTop = list.scrollHeight;
      state.atBottom = true;
    } else if (opts.anchor) {
      list.scrollTop = list.scrollHeight - oldHeight + oldTop;
    } else {
      list.scrollTop = oldTop;
    }
  }

  function appendMessageDom(m) {
    const list = $('#messages');
    const empty = list.querySelector('.empty');
    if (empty) empty.remove();
    const prev = state.messages[state.messages.length - 2];
    if (!prev || dayKey(prev.ts) !== dayKey(m.ts)) list.appendChild(dayDividerEl(m.ts));
    list.appendChild(messageEl(m, prev));
    if (state.atBottom) {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    } else {
      $('#newPill').classList.remove('hidden');
    }
  }

  function refreshMessage(m) {
    const idx = state.messages.findIndex((x) => x.id === m.id);
    if (idx === -1) return;
    state.messages[idx] = m;
    const el = $('#messages [data-id="' + m.id + '"]');
    if (el) {
      state.suppressAnim = true;
      el.replaceWith(messageEl(m, state.messages[idx - 1]));
      state.suppressAnim = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Read state                                                        */
  /* ---------------------------------------------------------------- */

  function markRead(force) {
    const room = activeRoom();
    if (!room) return;
    if (!force && !room.unread && !room._dirty) return;
    const roomId = room.id;
    if (readTimer) clearTimeout(readTimer);
    readTimer = setTimeout(async () => {
      if (state.activeRoomId !== roomId) return;
      const r = state.rooms.find((x) => x.id === roomId);
      if (r) { r.unread = 0; r._dirty = false; renderSidebar(); }
      try { await api('/api/rooms/' + roomId + '/read', { method: 'POST' }); } catch (e) { /* ignore */ }
    }, 250);
  }

  /* ---------------------------------------------------------------- */
  /* Composer                                                          */
  /* ---------------------------------------------------------------- */

  function autoSize() {
    const ta = $('#input');
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }

  function cancelEditUI() {
    $('#editBar').classList.add('hidden');
    const ta = $('#input');
    if (ta) { ta.value = ''; autoSize(); }
  }

  function startEdit(m) {
    state.editing = m;
    $('#editBar').classList.remove('hidden');
    const ta = $('#input');
    ta.value = m.text;
    autoSize();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function cancelEdit() {
    state.editing = null;
    cancelEditUI();
  }

  async function sendCurrent() {
    const room = activeRoom();
    const ta = $('#input');
    if (!room || !ta) return;
    const text = ta.value.trim();
    if (!text) return;

    if (state.editing) {
      const m = state.editing;
      cancelEdit();
      try {
        await api('/api/messages/' + m.id, { method: 'PATCH', body: { text } });
      } catch (e) { toast(e.message); }
      return;
    }

    ta.value = '';
    autoSize();
    try {
      const r = await api('/api/rooms/' + room.id + '/messages', { method: 'POST', body: { text } });
      handleEvent({ type: 'message', roomId: room.id, message: r.message });
    } catch (e) {
      toast(e.message);
      ta.value = text;
      autoSize();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Live events                                                       */
  /* ---------------------------------------------------------------- */

  function connectSSE() {
    if (es) { es.close(); es = null; }
    es = new EventSource('/api/events');
    es.onopen = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    };
    es.onmessage = (e) => {
      try { handleEvent(JSON.parse(e.data)); } catch (err) { /* ignore */ }
    };
    es.onerror = () => {
      if (!pollTimer) pollTimer = setInterval(pollSync, 4000);
    };
  }

  async function pollSync() {
    try {
      await loadBootstrap();
      renderHeader();
      if (state.activeRoomId != null) {
        const r = await api('/api/rooms/' + state.activeRoomId + '/messages');
        if (state.activeRoomId != null) {
          const sig = (arr) => JSON.stringify(arr.map((m) => [m.id, m.text, m.editedAt || 0, m.reactions]));
          if (sig(r.messages) !== sig(state.messages)) {
            state.messages = r.messages;
            state.hasMore = r.hasMore;
            renderMessages({ anchor: false });
            markRead();
          } else {
            state.hasMore = r.hasMore;
          }
        }
      }
    } catch (e) { /* keep trying */ }
  }

  function setTyping(roomId, userId, username) {
    if (userId === state.me.id) return;
    if (!state.typing[roomId]) state.typing[roomId] = {};
    state.typing[roomId][userId] = { name: username, until: Date.now() + 3200 };
    renderTyping();
    setTimeout(renderTyping, 3300);
  }

  function renderTyping() {
    const room = activeRoom();
    const line = $('#typingLine');
    if (!room) return;
    const t = state.typing[room.id] || {};
    const nowTs = Date.now();
    const names = Object.values(t).filter((x) => x.until > nowTs).map((x) => x.name);
    if (!names.length) { line.classList.add('hidden'); return; }
    $('#typingText').textContent = names.length === 1 ? names[0] + ' is typing…'
      : names.length === 2 ? names.join(' and ') + ' are typing…'
      : 'Several people are typing…';
    line.classList.remove('hidden');
  }

  function handleEvent(ev) {
    switch (ev.type) {
      case 'hello':
        state.online = new Set(ev.online);
        renderHeader();
        break;

      case 'presence':
        state.online = new Set(ev.online);
        renderHeader();
        renderSidebar();
        break;

      case 'message': {
        const msg = ev.message;
        const room = state.rooms.find((r) => r.id === ev.roomId);
        if (room) {
          room.lastMessage = { text: msg.text, ts: msg.ts, userId: msg.userId, username: msg.username, system: !!msg.system };
        }
        if (state.typing[ev.roomId] && state.typing[ev.roomId][msg.userId]) {
          delete state.typing[ev.roomId][msg.userId];
          renderTyping();
        }
        const mine = msg.userId === state.me.id;
        if (ev.roomId === state.activeRoomId) {
          if (!state.messages.some((m) => m.id === msg.id)) {
            state.messages.push(msg);
            appendMessageDom(msg);
          }
          if (!mine && document.hasFocus() && state.atBottom) {
            if (room) room._dirty = true;
            markRead();
          } else if (!mine) {
            if (room) room.unread = (room.unread || 0) + 1;
          }
        } else if (!mine) {
          if (room) room.unread = (room.unread || 0) + 1;
        }
        renderSidebar();
        break;
      }

      case 'delete': {
        const idx = state.messages.findIndex((m) => m.id === ev.messageId);
        if (idx > -1) state.messages.splice(idx, 1);
        const el = $('#messages [data-id="' + ev.messageId + '"]');
        if (el) el.remove();
        const room = state.rooms.find((r) => r.id === ev.roomId);
        if (room && ev.roomId === state.activeRoomId && state.messages.length) {
          const last = state.messages[state.messages.length - 1];
          room.lastMessage = { text: last.text, ts: last.ts, userId: last.userId, username: last.username, system: !!last.system };
        }
        renderSidebar();
        break;
      }

      case 'update': {
        refreshMessage(ev.message);
        break;
      }

      case 'reaction': {
        const m = state.messages.find((x) => x.id === ev.messageId);
        if (m) { m.reactions = ev.reactions; refreshMessage(m); }
        break;
      }

      case 'typing':
        setTyping(ev.roomId, ev.userId, ev.username);
        break;

      case 'room': {
        if (!state.rooms.some((r) => r.id === ev.room.id)) {
          state.rooms.push(Object.assign({ unread: 0, lastMessage: null }, ev.room));
          if (ev.message) {
            const r = state.rooms[state.rooms.length - 1];
            r.lastMessage = { text: ev.message.text, ts: ev.message.ts, userId: ev.message.userId, username: ev.message.username, system: !!ev.message.system };
            if (ev.room.id === state.activeRoomId) { state.messages.push(ev.message); appendMessageDom(ev.message); }
          }
          renderSidebar();
        }
        break;
      }

      case 'room-update': {
        const r = state.rooms.find((x) => x.id === ev.room.id);
        if (r) { r.name = ev.room.name; r.type = ev.room.type; }
        renderSidebar();
        if (state.activeRoomId === ev.room.id) { renderHeader(); renderComposer(); }
        break;
      }

      case 'room-deleted': {
        state.rooms = state.rooms.filter((r) => r.id !== ev.roomId);
        if (state.activeRoomId === ev.roomId && state.rooms.length) {
          openRoom(state.rooms[0].id, { history: 'replace' });
        }
        renderSidebar();
        toast('Chat deleted');
        break;
      }

      case 'user': {
        state.users.set(ev.user.id, ev.user);
        if (ev.user.id === state.me.id) {
          const wasAdmin = state.me.isAdmin;
          state.me = ev.user;
          if (wasAdmin !== ev.user.isAdmin) {
            renderSidebar();
            renderComposer();
            toast(ev.user.isAdmin ? 'You are now an admin' : 'Admin access removed');
          }
        }
        renderHeader();
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Reactions                                                         */
  /* ---------------------------------------------------------------- */

  function closeEmojiPop() {
    const pop = document.querySelector('.emoji-pop');
    if (pop) pop.remove();
    emojiPopFor = null;
  }

  function openEmojiPop(row) {
    closeEmojiPop();
    const pop = document.createElement('div');
    pop.className = 'emoji-pop';
    for (const emoji of state.reactions) {
      const b = document.createElement('button');
      b.className = 'ep-item';
      b.textContent = emoji;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(row.dataset.id);
        const m = state.messages.find((x) => x.id === id);
        closeEmojiPop();
        if (m) toggleReact(m, emoji);
      });
      pop.appendChild(b);
    }
    const bubble = row.querySelector('.bubble') || row;
    bubble.appendChild(pop);
    emojiPopFor = row.dataset.id;
  }

  async function toggleReact(m, emoji) {
    if (!m.reactions) m.reactions = {};
    const arr = m.reactions[emoji] || (m.reactions[emoji] = []);
    const i = arr.indexOf(state.me.id);
    if (i >= 0) arr.splice(i, 1); else arr.push(state.me.id);
    if (!arr.length) delete m.reactions[emoji];
    refreshMessage(m);
    try {
      const r = await api('/api/messages/' + m.id + '/react', { method: 'POST', body: { emoji } });
      m.reactions = r.reactions;
      refreshMessage(m);
    } catch (e) { toast(e.message); }
  }

  /* ---------------------------------------------------------------- */
  /* Context menu (right click)                                        */
  /* ---------------------------------------------------------------- */

  function closeCtxMenu() {
    if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
  }

  function openCtxMenu(x, y, m) {
    closeCtxMenu();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    const mine = m.userId === state.me.id;
    const items = [
      { id: 'copy', label: 'Copy text', icon: ICONS.copy },
      { id: 'react', label: 'React', icon: ICONS.smile },
      mine && { id: 'edit', label: 'Edit', icon: ICONS.pencil },
      (mine || state.me.isAdmin) && { id: 'del', label: 'Delete', icon: ICONS.trash, danger: true }
    ].filter(Boolean);

    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'ctx-item' + (it.danger ? ' danger' : '');
      b.innerHTML = it.icon + '<span>' + esc(it.label) + '</span>';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCtxMenu();
        if (it.id === 'copy') copyText(m.text).then(() => toast('Copied')).catch(() => {});
        else if (it.id === 'react') openEmojiPop($('#messages [data-id="' + m.id + '"]'));
        else if (it.id === 'edit') startEdit(m);
        else if (it.id === 'del') {
          openConfirm('Delete message?', 'This can\'t be undone.', 'Delete', true, async () => {
            try { await api('/api/messages/' + m.id, { method: 'DELETE' }); }
            catch (err) { toast(err.message); }
          });
        }
      });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
    ctxMenu = menu;
  }

  /* ---------------------------------------------------------------- */
  /* Modals                                                            */
  /* ---------------------------------------------------------------- */

  function openModal(html) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal">' + html + '</div>';
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    currentModal = overlay;
    return overlay;
  }

  function closeModal() {
    const m = currentModal;
    if (!m) return;
    currentModal = null;
    m.classList.remove('show');
    setTimeout(() => m.remove(), 150);
  }

  function openConfirm(title, body, label, danger, onYes) {
    const ov = openModal(
      '<h2>' + esc(title) + '</h2>' +
      (body ? '<p class="sub">' + esc(body) + '</p>' : '') +
      '<div class="modal-actions">' +
        '<button class="btn ghost" data-act="no">Cancel</button>' +
        '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-act="yes">' + esc(label) + '</button>' +
      '</div>'
    );
    ov.querySelector('[data-act="no"]').addEventListener('click', closeModal);
    ov.querySelector('[data-act="yes"]').addEventListener('click', async () => {
      closeModal();
      await onYes();
    });
  }

  function openRoomInfo() {
    const room = activeRoom();
    if (!room) return;
    const link = location.origin + '/r/' + room.slug;
    const users = Array.from(state.users.values())
      .sort((a, b) => ((state.online.has(b.id) ? 1 : 0) - (state.online.has(a.id) ? 1 : 0)) || a.username.localeCompare(b.username));

    const membersHtml = users.map((u) =>
      '<div class="user-row">' +
        '<div class="uavatar" style="background:' + colorFor(u.username) + '">' + esc(initials(u.username)) +
          (state.online.has(u.id) ? '<span class="odot"></span>' : '') +
        '</div>' +
        '<div class="uname">' + esc(u.username) + '</div>' +
        '<div class="utag ' + (u.isAdmin ? 'adm' : '') + '">' +
          (u.isOwner ? 'owner' : u.isAdmin ? 'admin' : (state.online.has(u.id) ? 'online' : '')) +
        '</div>' +
      '</div>'
    ).join('');

    let adminHtml = '';
    if (state.me.isAdmin) {
      adminHtml =
        '<section><h3>Manage</h3>' +
          '<div class="form-row"><input id="renameInput" maxlength="40" value="' + esc(room.name) + '" placeholder="Chat name">' +
          '<button class="btn ghost" id="renameBtn">Rename</button></div>' +
          '<div class="modal-actions"><button class="btn danger" id="delRoomBtn">Delete chat</button></div>' +
        '</section>';
    }

    const ov = openModal(
      '<h2>Chat info</h2>' +
      '<p class="sub">' + (room.type === 'channel' ? 'Channel — only admins can post.' : 'Group — everyone can post.') + '</p>' +
      '<div class="user-row" style="padding-left:0">' +
        '<div class="uavatar" style="width:48px;height:48px;font-size:18px;background:' + colorFor(room.name) + '">' + esc(initials(room.name)) + '</div>' +
        '<div><div class="uname" style="font-size:16px">' + esc(room.name) + '</div>' +
        '<span class="room-tag">' + room.type + '</span></div>' +
      '</div>' +
      '<section><h3>Invite link</h3>' +
        '<div class="invite-box"><input readonly value="' + esc(link) + '" onclick="this.select()">' +
        '<button class="btn ghost" id="copyLinkBtn">' + ICONS.copy + 'Copy</button></div>' +
        '<p class="sub" style="margin:8px 0 0">Anyone with this link can join after signing in.</p>' +
      '</section>' +
      '<section><h3>Members (' + users.length + ')</h3><div style="max-height:210px;overflow-y:auto">' + membersHtml + '</div></section>' +
      adminHtml
    );

    ov.querySelector('#copyLinkBtn').addEventListener('click', () => {
      copyText(link).then(() => toast('Link copied')).catch(() => toast(link));
    });

    const renameBtn = ov.querySelector('#renameBtn');
    if (renameBtn) {
      renameBtn.addEventListener('click', async () => {
        const name = ov.querySelector('#renameInput').value.trim();
        if (!name) return;
        try {
          await api('/api/rooms/' + room.id, { method: 'PATCH', body: { name } });
          closeModal();
          toast('Chat renamed');
        } catch (e) { toast(e.message); }
      });
    }

    const delBtn = ov.querySelector('#delRoomBtn');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        openConfirm('Delete ' + room.name + '?', 'All messages in this chat will be removed.', 'Delete chat', true, async () => {
          try {
            await api('/api/rooms/' + room.id, { method: 'DELETE' });
            closeModal();
          } catch (e) { toast(e.message); }
        });
      });
    }
  }

  function openAdminPanel() {
    const users = Array.from(state.users.values()).sort((a, b) => a.username.localeCompare(b.username));
    const roomsHtml = state.rooms.map((r) =>
      '<div class="room-row">' +
        '<div class="uavatar" style="background:' + colorFor(r.name) + '">' + esc(initials(r.name)) + '</div>' +
        '<div class="uname">' + esc(r.name) + '</div>' +
        '<span class="room-tag">' + r.type + '</span>' +
      '</div>'
    ).join('');

    const usersHtml = users.map((u) => {
      const isMe = u.id === state.me.id;
      const btn = u.isOwner ? '<span class="utag adm">owner</span>'
        : '<button class="btn small ' + (u.isAdmin ? 'ghost' : 'primary') + '" data-uid="' + u.id + '" data-val="' + (u.isAdmin ? 'false' : 'true') + '">' +
            (u.isAdmin ? 'Demote' : 'Make admin') + '</button>';
      return '<div class="user-row">' +
        '<div class="uavatar" style="background:' + colorFor(u.username) + '">' + esc(initials(u.username)) + '</div>' +
        '<div class="uname">' + esc(u.username) + (isMe ? ' <span class="utag">(you)</span>' : '') + '</div>' +
        btn + '</div>';
    }).join('');

    const ov = openModal(
      '<h2>Admin</h2>' +
      '<p class="sub">The first account registered is the owner and can\'t be demoted.</p>' +
      '<section><h3>New chat</h3>' +
        '<div class="form-row">' +
          '<input id="newRoomName" maxlength="40" placeholder="Name">' +
          '<select id="newRoomType"><option value="channel">Channel</option><option value="group">Group</option></select>' +
          '<button class="btn primary" id="createRoomBtn">Create</button>' +
        '</div>' +
        '<p class="sub" style="margin:8px 0 0">Channels: only admins post. Groups: everyone posts.</p>' +
      '</section>' +
      '<section><h3>Chats</h3>' + roomsHtml + '</section>' +
      '<section><h3>Members (' + users.length + ')</h3><div style="max-height:220px;overflow-y:auto">' + usersHtml + '</div></section>' +
      '<section><h3>Data</h3>' +
        '<a class="btn ghost" href="/api/admin/export" download>Download backup (JSON)</a>' +
      '</section>'
    );

    ov.querySelector('#createRoomBtn').addEventListener('click', async () => {
      const name = ov.querySelector('#newRoomName').value.trim();
      const type = ov.querySelector('#newRoomType').value;
      if (!name) { toast('Enter a name'); return; }
      try {
        const r = await api('/api/rooms', { method: 'POST', body: { name, type } });
        closeModal();
        toast('Chat created');
        setTimeout(() => {
          const room = state.rooms.find((x) => x.id === r.room.id);
          if (room) openRoom(room.id);
        }, 150);
      } catch (e) { toast(e.message); }
    });

    $$('[data-uid]', ov).forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = Number(btn.dataset.uid);
        const val = btn.dataset.val === 'true';
        try {
          await api('/api/users/' + uid + '/admin', { method: 'POST', body: { value: val } });
          openAdminPanel();
        } catch (e) { toast(e.message); }
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /* Theme                                                             */
  /* ---------------------------------------------------------------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('yori-theme', theme); } catch (e) {}
    $('#themeBtn').innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#17212b' : '#ffffff');
  }

  /* ---------------------------------------------------------------- */
  /* Mobile drawer                                                     */
  /* ---------------------------------------------------------------- */

  function openSidebar() {
    $('#sidebar').classList.add('open');
    $('#backdrop').classList.add('show');
  }
  function closeSidebar() {
    $('#sidebar').classList.remove('open');
    $('#backdrop').classList.remove('show');
  }

  /* ---------------------------------------------------------------- */
  /* Bindings                                                          */
  /* ---------------------------------------------------------------- */

  function bindAuth() {
    $('#authToggle').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
    $('#authForm').addEventListener('submit', submitAuth);
  }

  function bindApp() {
    $('#searchInput').addEventListener('input', renderSidebar);
    $('#menuBtn').addEventListener('click', openSidebar);
    $('#backdrop').addEventListener('click', closeSidebar);
    $('#themeBtn').addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    $('#adminBtn').addEventListener('click', openAdminPanel);
    $('#logoutBtn').addEventListener('click', async () => {
      try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
      location.href = '/';
    });

    $('#headInfo').addEventListener('click', openRoomInfo);
    $('#shareBtn').addEventListener('click', () => {
      const room = activeRoom();
      if (!room) return;
      const link = location.origin + '/r/' + room.slug;
      copyText(link).then(() => toast('Link copied')).catch(() => toast(link));
    });

    const ta = $('#input');
    ta.addEventListener('input', () => {
      autoSize();
      const room = activeRoom();
      if (room && Date.now() - lastTypingSent > 2000) {
        lastTypingSent = Date.now();
        api('/api/rooms/' + room.id + '/typing', { method: 'POST' }).catch(() => {});
      }
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
      if (e.key === 'Escape') cancelEdit();
    });
    $('#sendBtn').addEventListener('click', sendCurrent);
    $('#cancelEdit').addEventListener('click', cancelEdit);

    const list = $('#messages');
    list.addEventListener('scroll', () => {
      state.atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      if (state.atBottom) {
        $('#newPill').classList.add('hidden');
        markRead();
      }
      if (list.scrollTop < 60 && state.hasMore && !state.loadingOlder) loadOlder();
    });

    $('#newPill').addEventListener('click', () => {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
      markRead(true);
    });

    // message actions (delegated)
    list.addEventListener('click', (e) => {
      const pill = e.target.closest('.react-pill');
      if (pill) {
        const row = pill.closest('[data-id]');
        const m = state.messages.find((x) => x.id === Number(row.dataset.id));
        if (m) toggleReact(m, pill.dataset.emoji);
        return;
      }
      const reactBtn = e.target.closest('.react-btn');
      if (reactBtn) {
        e.stopPropagation();
        const row = reactBtn.closest('[data-id]');
        if (String(row.dataset.id) === emojiPopFor) closeEmojiPop();
        else openEmojiPop(row);
        return;
      }
      const editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        const row = editBtn.closest('[data-id]');
        const m = state.messages.find((x) => x.id === Number(row.dataset.id));
        if (m) startEdit(m);
        return;
      }
      const delBtn = e.target.closest('.del-btn');
      if (delBtn) {
        const row = delBtn.closest('[data-id]');
        const id = Number(row.dataset.id);
        const m = state.messages.find((x) => x.id === id);
        if (m) {
          openConfirm('Delete message?', 'This can\'t be undone.', 'Delete', true, async () => {
            try { await api('/api/messages/' + id, { method: 'DELETE' }); }
            catch (err) { toast(err.message); }
          });
        }
        return;
      }
      if (!e.target.closest('.emoji-pop')) closeEmojiPop();
    });

    // double click a message to heart it
    list.addEventListener('dblclick', (e) => {
      if (e.target.closest('a')) return;
      const row = e.target.closest('[data-id]');
      if (!row) return;
      const m = state.messages.find((x) => x.id === Number(row.dataset.id));
      if (m && !m.system) { e.preventDefault(); toggleReact(m, '❤️'); }
    });

    // right click → context menu
    list.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.msg-row[data-id]');
      if (!row) return;
      const m = state.messages.find((x) => x.id === Number(row.dataset.id));
      if (!m || m.system) return;
      e.preventDefault();
      closeEmojiPop();
      openCtxMenu(e.clientX, e.clientY, m);
    });

    document.addEventListener('click', (e) => {
      if (ctxMenu && !e.target.closest('.ctx-menu')) closeCtxMenu();
      if (!e.target.closest('.emoji-pop') && !e.target.closest('.react-btn')) closeEmojiPop();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModal(); closeCtxMenu(); }
    });
    window.addEventListener('scroll', closeCtxMenu, true);

    window.addEventListener('focus', () => { markRead(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) markRead(); });

    window.addEventListener('popstate', routeFromPath);
  }

  function routeFromPath() {
    if (!state.me) return;
    const m = location.pathname.match(/^\/r\/([a-z0-9-]+)/i);
    const room = m && state.rooms.find((r) => r.slug === m[1].toLowerCase());
    if (room && room.id !== state.activeRoomId) openRoom(room.id, { history: false });
  }

  async function loadOlder() {
    const room = activeRoom();
    if (!room || !state.messages.length) return;
    state.loadingOlder = true;
    try {
      const first = state.messages[0].id;
      const r = await api('/api/rooms/' + room.id + '/messages?before=' + first);
      if (state.activeRoomId === room.id) {
        state.messages = r.messages.concat(state.messages);
        state.hasMore = r.hasMore;
        renderMessages({ anchor: true });
      }
    } catch (e) { /* ignore */ }
    finally { state.loadingOlder = false; }
  }

  /* ---------------------------------------------------------------- */
  /* Init                                                              */
  /* ---------------------------------------------------------------- */

  async function init() {
    bindAuth();
    bindApp();
    applyTheme(document.documentElement.dataset.theme || 'dark');
    setAuthMode('login');

    const m = location.pathname.match(/^\/r\/([a-z0-9-]+)/i);
    if (m) state.initialSlug = m[1].toLowerCase();

    try {
      const r = await api('/api/me');
      state.me = r.user;
      enterApp();
    } catch (e) {
      showAuth();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
