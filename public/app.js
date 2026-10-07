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

  /* Emoji shortcodes — type :fire: or use the picker */
  const SHORTCODES = [
    ['fire', '🔥'], ['lit', '🔥'], ['heart', '❤️'], ['love', '❤️'], ['laugh', '😂'], ['lol', '😂'], ['joy', '😂'],
    ['cry', '😢'], ['sob', '😭'], ['smile', '😄'], ['grin', '😁'], ['wink', '😉'], ['tongue', '😜'], ['cool', '😎'],
    ['think', '🤔'], ['hmm', '🤔'], ['eyes', '👀'], ['look', '👀'], ['skull', '💀'], ['dead', '💀'], ['ghost', '👻'],
    ['party', '🥳'], ['tada', '🎉'], ['star', '⭐'], ['stars', '✨'], ['sparkle', '✨'], ['clap', '👏'], ['pray', '🙏'],
    ['up', '👍'], ['yes', '👍'], ['like', '👍'], ['down', '👎'], ['no', '👎'], ['ok', '👌'], ['muscle', '💪'],
    ['100', '💯'], ['boom', '💥'], ['zap', '⚡'], ['rocket', '🚀'], ['moon', '🌙'], ['sun', '☀️'], ['cake', '🍰'],
    ['coffee', '☕'], ['pizza', '🍕'], ['crown', '👑'], ['money', '💰'], ['gift', '🎁'], ['check', '✅'], ['done', '✅'],
    ['x', '❌'], ['warn', '⚠️'], ['question', '❓'], ['omg', '😱'], ['scream', '😱'], ['shock', '😱'], ['facepalm', '🤦'],
    ['shrug', '🤷'], ['sleep', '😴'], ['zzz', '😴'], ['angry', '😡'], ['mad', '😡'], ['hot', '🥵'], ['cold', '🥶'],
    ['wave', '👋'], ['hi', '👋'], ['bye', '👋'], ['salute', '🫡'], ['shh', '🤫'], ['nerd', '🤓'], ['angel', '😇'],
    ['clown', '🤡'], ['popcorn', '🍿'], ['trophy', '🏆'], ['music', '🎵'], ['game', '🎮'], ['dice', '🎲'], ['bell', '🔔'],
    ['pin', '📌'], ['link', '🔗'], ['target', '🎯'], ['chart', '📈'], ['drool', '🤤'], ['kiss', '😘'], ['inlove', '😍']
  ];
  const SHORTMAP = Object.create(null);
  for (const [n, e] of SHORTCODES) SHORTMAP[n] = e;
  const PICKER_EMOJIS = [...new Set(SHORTCODES.map((s) => s[1]))];

  function renderText(text) {
    return esc(text)
      .replace(/:([a-zA-Z0-9_]{1,24}):/g, (all, n) => SHORTMAP[n.toLowerCase()] || all)
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
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    channel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10v4h3l5 4V6l-5 4H3z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.2 6a9 9 0 0 1 0 12"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
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
    pendingJump: null,
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
  let acState = null;      // shortcode autocomplete { items, sel }
  let emojiGrid = null;    // composer picker element

  const activeRoom = () => state.rooms.find((r) => r.id === state.activeRoomId) || null;
  const channelRoom = () => state.rooms.find((r) => r.type === 'channel') || null;
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
          ? 'You are the first user — this account becomes the owner.'
          : 'Usernames are 5-20 characters.';
      }).catch(() => {});
    } else {
      $('#authNote').textContent = 'Usernames are 5-20 characters.';
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
    closeAC();
    closeEmojiGrid();
    renderSidebar();
    renderHeader();
    renderPinBar();
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
      if (state.pendingJump) {
        const jumpId = state.pendingJump;
        state.pendingJump = null;
        jumpToMessage(jumpId);
      }
    } catch (e) {
      toast(e.message);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Sidebar                                                           */
  /* ---------------------------------------------------------------- */

  function roomIconHtml(room, cls) {
    if (room.type === 'channel') {
      return '<div class="' + (cls || 'room-avatar') + '" style="background:var(--accent)">' + ICONS.channel + '</div>';
    }
    return '<div class="' + (cls || 'room-avatar') + '" style="background:' + colorFor(room.name) + '">' + ICONS.group + '</div>';
  }

  function previewText(room, lm) {
    if (!lm) return 'No messages';
    if (lm.system) return lm.text;
    let prefix = '';
    if (lm.fromChannel) {
      const ch = channelRoom();
      prefix = (ch ? ch.name : 'Channel') + ': ';
    } else if (lm.userId === state.me.id) {
      prefix = 'You: ';
    } else if (room.type === 'group' && lm.username) {
      prefix = lm.username + ': ';
    }
    let t = (prefix + String(lm.text)).replace(/\n/g, ' ');
    if (t.length > 44) t = t.slice(0, 44) + '…';
    return t;
  }

  function renderSidebar() {
    const list = $('#roomList');
    list.innerHTML = '';
    for (const room of state.rooms) {
      const item = document.createElement('div');
      item.className = 'room-item' + (room.id === state.activeRoomId ? ' active' : '');
      item.innerHTML =
        roomIconHtml(room) +
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
  /* Header, pin bar & composer                                        */
  /* ---------------------------------------------------------------- */

  function renderHeader() {
    const room = activeRoom();
    if (!room) return;
    const av = $('#headAvatar');
    av.style.background = room.type === 'channel' ? 'var(--accent)' : colorFor(room.name);
    av.innerHTML = room.type === 'channel' ? ICONS.channel : ICONS.group;
    $('#headName').innerHTML = esc(room.name) + '<span class="type-tag">' + (room.type === 'channel' ? 'channel' : 'group') + '</span>';
    const word = room.type === 'channel' ? 'subscriber' + (state.users.size === 1 ? '' : 's') : 'member' + (state.users.size === 1 ? '' : 's');
    $('#headSub').innerHTML = esc(state.users.size + ' ' + word) + ' · <span class="on">' + state.online.size + ' online</span>';
  }

  function renderPinBar() {
    const room = activeRoom();
    const bar = $('#pinBar');
    if (!room || !room.pinned) { bar.classList.add('hidden'); return; }
    let t = String(room.pinned.text || '');
    $('#pinPreview').textContent = t.length > 90 ? t.slice(0, 90) + '…' : t;
    bar.classList.remove('hidden');
  }

  function jumpToMessage(id) {
    const el = $('#messages [data-id="' + id + '"]');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1700);
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

    const fwd = !!m.fromChannel;
    const mine = m.userId === state.me.id && !fwd;
    const room = activeRoom();
    const grouped = prev && !prev.system && prev.userId === m.userId && !!prev.fromChannel === fwd && (m.ts - prev.ts) < 300000;
    const user = state.users.get(m.userId) || { username: m.username || 'user', isAdmin: false };
    const big = isEmojiOnly(m.text);

    row.className = 'msg-row' + (mine ? ' mine' : '') + (state.suppressAnim ? ' no-anim' : '');
    row.dataset.id = m.id;

    let avatarHtml = '';
    if (!mine && !grouped) {
      avatarHtml = fwd
        ? '<div class="avatar" style="background:var(--accent)">' + ICONS.channel + '</div>'
        : '<div class="avatar letters" style="background:' + colorFor(user.username) + '">' + esc(initials(user.username)) + '</div>';
    }

    let headerHtml = '';
    if (!grouped) {
      if (fwd) {
        const ch = channelRoom();
        headerHtml = '<div class="fwd-from">' + ICONS.channel + '<span>' + esc(ch ? ch.name : 'Channel') + '</span></div>';
      } else if (!mine && room && room.type === 'group') {
        headerHtml = '<div class="msg-name" style="color:' + colorFor(user.username) + '">' + esc(user.username) +
          (user.isAdmin ? '<span class="admin-chip">admin</span>' : '') + '</div>';
      }
    }

    const bodyHtml =
      '<div class="bubble' + (grouped ? '' : ' tail') + (big ? ' big' : '') + (fwd ? ' fwd' : '') + '">' +
        headerHtml +
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
    closeAC();
  }

  async function sendCurrent() {
    const room = activeRoom();
    const ta = $('#input');
    if (!room || !ta) return;
    const text = ta.value.trim();
    if (!text) return;
    closeAC();

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
      // Channel posts auto-forward into the group; the pin event arrives over SSE.
    } catch (e) {
      toast(e.message);
      ta.value = text;
      autoSize();
    }
  }

  function insertAtCaret(text) {
    const ta = $('#input');
    if (!ta) return;
    const s = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    const e = ta.selectionEnd != null ? ta.selectionEnd : ta.value.length;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    const np = s + text.length;
    ta.setSelectionRange(np, np);
    ta.focus();
    autoSize();
  }

  /* ---------------- emoji picker ---------------- */

  function closeEmojiGrid() {
    if (emojiGrid) { emojiGrid.remove(); emojiGrid = null; }
  }

  function toggleEmojiGrid() {
    if (emojiGrid) { closeEmojiGrid(); return; }
    const grid = document.createElement('div');
    grid.className = 'emoji-grid';
    for (const e of PICKER_EMOJIS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'eg-item';
      b.textContent = e;
      b.title = ':' + (SHORTCODES.find((s) => s[1] === e) || ['', ''])[0] + ':';
      b.addEventListener('click', () => { insertAtCaret(e); });
      grid.appendChild(b);
    }
    $('.composer').appendChild(grid);
    emojiGrid = grid;
  }

  /* ---------------- shortcode autocomplete ---------------- */

  function closeAC() {
    acState = null;
    const el = $('.ac-popup');
    if (el) el.remove();
  }

  function renderAC() {
    if (!acState) return;
    const el = $('.ac-popup');
    if (!el) return;
    $$('.ac-item', el).forEach((it, i) => it.classList.toggle('sel', i === acState.sel));
  }

  function openAC(items) {
    closeAC();
    acState = { items, sel: 0 };
    const pop = document.createElement('div');
    pop.className = 'ac-popup';
    items.forEach(([name, emoji], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ac-item' + (i === 0 ? ' sel' : '');
      b.innerHTML = '<span class="e">' + emoji + '</span><span class="n">:' + esc(name) + ':</span><span class="k">Tab</span>';
      b.addEventListener('mouseenter', () => { acState.sel = i; renderAC(); });
      b.addEventListener('mousedown', (e) => e.preventDefault()); // keep textarea focus
      b.addEventListener('click', () => insertAC(name, emoji));
      pop.appendChild(b);
    });
    $('#acAnchor').appendChild(pop);
  }

  function updateAC() {
    const ta = $('#input');
    const pos = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    const before = ta.value.slice(0, pos);
    const lastColon = before.lastIndexOf(':');
    if (lastColon === -1) return closeAC();
    const partial = before.slice(lastColon + 1);
    if (!/^[a-zA-Z0-9_]{1,24}$/.test(partial)) return closeAC();
    if (lastColon > 0 && !/\s/.test(before[lastColon - 1])) return closeAC();

    const q = partial.toLowerCase();
    const starts = SHORTCODES.filter((s) => s[0].startsWith(q));
    const contains = SHORTCODES.filter((s) => !s[0].startsWith(q) && s[0].includes(q));
    const items = starts.concat(contains).slice(0, 8);
    if (!items.length) return closeAC();
    if (acState && acState.items === items) return;
    openAC(items);
  }

  function insertAC(name, emoji) {
    const ta = $('#input');
    const pos = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    const lastColon = before.lastIndexOf(':');
    if (lastColon === -1) { closeAC(); return; }
    let suffix = ' ';
    if (after.startsWith(' ')) suffix = '';
    ta.value = before.slice(0, lastColon) + emoji + suffix + after;
    const np = lastColon + emoji.length + suffix.length;
    ta.setSelectionRange(np, np);
    closeAC();
    ta.focus();
    autoSize();
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
      renderPinBar();
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
          room.lastMessage = {
            text: msg.text, ts: msg.ts, userId: msg.userId, username: msg.username,
            system: !!msg.system, fromChannel: !!msg.fromChannel
          };
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

      case 'pin': {
        const room = state.rooms.find((r) => r.id === ev.roomId);
        if (room) room.pinned = ev.pinned;
        renderPinBar();
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
          room.lastMessage = {
            text: last.text, ts: last.ts, userId: last.userId, username: last.username,
            system: !!last.system, fromChannel: !!last.fromChannel
          };
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
  /* Reactions — one per user per post                                 */
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
    const had = (m.reactions[emoji] || []).includes(state.me.id);
    // one reaction per user: pull out of every emoji first, then set the new one
    for (const e of Object.keys(m.reactions)) {
      m.reactions[e] = m.reactions[e].filter((id) => id !== state.me.id);
      if (!m.reactions[e].length) delete m.reactions[e];
    }
    if (!had) m.reactions[emoji] = (m.reactions[emoji] || []).concat(state.me.id);
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

  function messageLink(m) {
    const room = state.rooms.find((r) => r.id === m.roomId) || activeRoom();
    return location.origin + '/r/' + (room ? room.slug : '') + '?m=' + m.id;
  }

  function openCtxMenu(x, y, m) {
    closeCtxMenu();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    const mine = m.userId === state.me.id;
    const items = [
      { id: 'copy', label: 'Copy text', icon: ICONS.copy },
      { id: 'link', label: 'Copy link', icon: ICONS.link },
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
        else if (it.id === 'link') copyText(messageLink(m)).then(() => toast('Link copied')).catch(() => {});
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

    const ov = openModal(
      '<h2>Chat info</h2>' +
      '<p class="sub">' + (room.type === 'channel' ? 'Channel — only admins can post, everyone can react.' : 'Group — everyone can post. Channel posts arrive here automatically.') + '</p>' +
      '<div class="user-row" style="padding-left:0">' +
        '<div class="uavatar big" style="background:' + (room.type === 'channel' ? 'var(--accent)' : colorFor(room.name)) + '">' +
          (room.type === 'channel' ? ICONS.channel : ICONS.group) +
        '</div>' +
        '<div><div class="uname" style="font-size:16px">' + esc(room.name) + '</div>' +
        '<span class="room-tag">' + room.type + '</span></div>' +
      '</div>' +
      '<section><h3>Invite link</h3>' +
        '<div class="invite-box"><input readonly value="' + esc(link) + '" onclick="this.select()">' +
        '<button class="btn ghost" id="copyLinkBtn">' + ICONS.copy + 'Copy</button></div>' +
        '<p class="sub" style="margin:8px 0 0">Anyone with this link can join after signing in.</p>' +
      '</section>' +
      '<section><h3>Members (' + users.length + ')</h3><div style="max-height:210px;overflow-y:auto">' + membersHtml + '</div></section>'
    );

    ov.querySelector('#copyLinkBtn').addEventListener('click', () => {
      copyText(link).then(() => toast('Link copied')).catch(() => toast(link));
    });
  }

  function openAdminPanel() {
    const isOwner = !!state.me.isOwner;
    const users = Array.from(state.users.values()).sort((a, b) => a.username.localeCompare(b.username));

    const usersHtml = users.map((u) => {
      const isMe = u.id === state.me.id;
      let right;
      if (u.isOwner) right = '<span class="utag adm">owner</span>';
      else if (!isOwner) right = '<span class="utag">' + (u.isAdmin ? 'admin' : '') + '</span>';
      else right = '<button class="btn small ' + (u.isAdmin ? 'ghost' : 'primary') + '" data-uid="' + u.id + '" data-val="' + (u.isAdmin ? 'false' : 'true') + '">' +
            (u.isAdmin ? 'Demote' : 'Make admin') + '</button>';
      return '<div class="user-row">' +
        '<div class="uavatar" style="background:' + colorFor(u.username) + '">' + esc(initials(u.username)) + '</div>' +
        '<div class="uname">' + esc(u.username) + (isMe ? ' <span class="utag">(you)</span>' : '') + '</div>' +
        right + '</div>';
    }).join('');

    const ov = openModal(
      '<h2>Admin</h2>' +
      '<p class="sub">' + (isOwner
        ? 'Admins can post in the channel. Only you can add or remove them.'
        : 'Only the owner can manage admins.') + '</p>' +
      '<section><h3>Members (' + users.length + ')</h3><div style="max-height:260px;overflow-y:auto">' + usersHtml + '</div></section>' +
      '<section><h3>Data</h3>' +
        '<a class="btn ghost" href="/api/admin/export" download>Download backup (JSON)</a>' +
      '</section>'
    );

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

    $('#pinBar').addEventListener('click', () => {
      const room = activeRoom();
      if (room && room.pinned) jumpToMessage(room.pinned.id);
    });

    const ta = $('#input');
    ta.addEventListener('input', () => {
      autoSize();
      updateAC();
      const room = activeRoom();
      if (room && Date.now() - lastTypingSent > 2000) {
        lastTypingSent = Date.now();
        api('/api/rooms/' + room.id + '/typing', { method: 'POST' }).catch(() => {});
      }
    });
    ta.addEventListener('keydown', (e) => {
      if (acState) {
        if (e.key === 'ArrowDown') { e.preventDefault(); acState.sel = (acState.sel + 1) % acState.items.length; renderAC(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); acState.sel = (acState.sel - 1 + acState.items.length) % acState.items.length; renderAC(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const it = acState.items[acState.sel]; insertAC(it[0], it[1]); return; }
        if (e.key === 'Escape') { closeAC(); return; }
      }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); }
      if (e.key === 'Escape') cancelEdit();
    });
    $('#sendBtn').addEventListener('click', sendCurrent);
    $('#cancelEdit').addEventListener('click', cancelEdit);
    $('#emojiBtn').addEventListener('click', toggleEmojiGrid);

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
      if (emojiGrid && !e.target.closest('.emoji-grid') && !e.target.closest('#emojiBtn')) closeEmojiGrid();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModal(); closeCtxMenu(); closeEmojiGrid(); }
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
    const jump = new URLSearchParams(location.search).get('m');
    if (jump && /^\d+$/.test(jump)) state.pendingJump = Number(jump);

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
