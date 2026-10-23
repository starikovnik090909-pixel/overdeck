// externalChat.js
// Чат с других платформ (мультистрим): Kick, YouTube, VK Live. Только чтение, без входа в аккаунт зрителя.
// Каждое сообщение приводится к одному формату и отдаётся в onMessage — сервер показывает его в зеркале чата с меткой платформы.
//
//  • Kick — Pusher WebSocket публичного чата (неофициальный: Kick может изменить его без предупреждения).
//  • YouTube — официальный API (liveChatMessages.list), нужен API-ключ Google и ссылка на трансляцию.
//  • VK Live — публичный Centrifugo-сокет чата (неофициальный, формат сообщений разбирается «терпимо»).
//
// Переменная OVERDECK_CHAT_DEBUG=1 печатает «сырые» сообщения платформ — нужна, если формат у платформы изменился.

const WebSocket = require('ws');

const DEBUG = process.env.OVERDECK_CHAT_DEBUG === '1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

let wsFactory = (url, opts) => new WebSocket(url, opts); // для тестов можно подменить (прокси песочницы)
function _setWsFactory(fn) { wsFactory = fn || ((url, opts) => new WebSocket(url, opts)); }
let fetchImpl = (...a) => fetch(...a);
function _setFetch(fn) { fetchImpl = fn || ((...a) => fetch(...a)); }

const PLATFORMS = ['kick', 'youtube', 'vk'];
const PLATFORM_NAMES = { kick: 'Kick', youtube: 'YouTube', vk: 'VK Live' };

const state = {};
PLATFORMS.forEach((p) => { state[p] = { running: false, status: 'off', target: '', label: '', lastError: '', count: 0, stop: null, onMessage: null }; });

const seen = new Set();
function dedupe(platform, id) {
  if (!id) return false;
  const k = platform + ':' + id;
  if (seen.has(k)) return true;
  seen.add(k);
  if (seen.size > 2000) seen.delete(seen.values().next().value);
  return false;
}

function setStatus(p, status, err) {
  state[p].status = status;
  if (err !== undefined) state[p].lastError = err || '';
}

function emit(p, msg) {
  const st = state[p];
  if (!st.running || !st.onMessage) return;
  if (!msg.text || !String(msg.text).trim()) return;
  if (dedupe(p, msg.id)) return;
  st.count += 1;
  try { st.onMessage({ platform: p, ...msg }); } catch (e) { console.warn('[Чат ' + PLATFORM_NAMES[p] + '] Ошибка обработки сообщения:', e.message); }
}

function sleep(ms, signal) {
  return new Promise((res) => {
    const t = setTimeout(res, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
  });
}

// ---------------------------------------------------------------- Kick

const KICK_WEB = process.env.KICK_WEB_BASE || 'https://web.kick.com/api';
const KICK_CHANNEL_API = process.env.KICK_CHANNEL_API || 'https://kick.com/api/v2/channels/';

/** Из «xqc», «@xqc» или «kick.com/xqc» берёт ник канала. */
function parseKickTarget(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?kick\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
  return /^[A-Za-z0-9_-]{2,40}$/.test(s) ? { slug: s.toLowerCase() } : null;
}

async function kickJson(url, opts) {
  let res;
  try { res = await fetchImpl(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://kick.com', ...((opts && opts.headers) || {}) } }); } catch (e) { throw new Error('Нет связи с Kick: ' + e.message); }
  return res;
}

async function kickResolve(t) {
  const res = await kickJson(KICK_CHANNEL_API + encodeURIComponent(t.slug));
  if (res.status === 404) { const er = new Error('Канал «' + t.slug + '» на Kick не найден.'); er.fatal = true; throw er; }
  if (!res.ok) throw new Error('Kick не отдал данные канала (ответ ' + res.status + '). Попробуем ещё раз.');
  let j;
  try { j = await res.json(); } catch (e) { throw new Error('Kick ответил не в том формате. Попробуем ещё раз.'); }
  if (!j || !j.id || !(j.chatroom && j.chatroom.id)) { const er = new Error('У канала нет чата Kick.'); er.fatal = true; throw er; }
  return { channelId: Number(j.id), chatroomId: Number(j.chatroom.id), name: j.slug || t.slug };
}

/** Адрес сокета и гостевой токен: Kick раздаёт их без входа в аккаунт. */
async function kickRealtime(channelId) {
  const body = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) });
  const clientId = require('crypto').randomUUID();
  const r1 = await kickJson(KICK_WEB + '/v1/realtime/channels/' + channelId + '/chat/connection', body({ client: { id: clientId, type: 'web' }, capabilities: { accepted_providers: [{ provider: 'centrifugo' }] } }));
  if (!r1.ok) throw new Error('Kick не выдал адрес чата (ответ ' + r1.status + ').');
  const d1 = (await r1.json()).data || {};
  const conn = (d1.connections || []).find((c) => c.provider === 'centrifugo' && c.credentials && c.credentials.url);
  if (!conn) throw new Error('Kick изменил способ доставки чата — нужна новая версия Overdeck.');
  const r2 = await kickJson(KICK_WEB + '/v1/realtime/auth/connection', body({ client_id: clientId }));
  if (!r2.ok) throw new Error('Kick не выдал гостевой токен чата (ответ ' + r2.status + ').');
  const token = ((await r2.json()).data || {}).token;
  if (!token) throw new Error('Kick не выдал гостевой токен чата.');
  return { url: conn.credentials.url, token };
}

function kickParts(content) {
  const parts = [];
  const re = /\[emote:(\d+):([^\]]+)\]/g;
  let last = 0; let m;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type: 'text', text: content.slice(last, m.index) });
    parts.push({ type: 'emote', name: m[2], imageUrl: 'https://files.kick.com/emotes/' + m[1] + '/fullsize' });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: 'text', text: content.slice(last) });
  return parts;
}

function kickMessage(d) {
  const s = d.sender || {};
  const ident = s.identity || {};
  const types = new Set((ident.badges || []).map((b) => b && b.type));
  const content = String(d.content || '');
  return {
    id: String(d.id || ''),
    login: String(s.slug || s.username || '').toLowerCase(),
    username: String(s.username || s.slug || 'kick'),
    color: /^#[0-9a-f]{6}$/i.test(ident.color || '') ? ident.color : null,
    avatarUrl: null,
    roles: { mod: types.has('moderator') || types.has('broadcaster'), vip: types.has('vip') },
    parts: kickParts(content),
    text: content.replace(/\[emote:\d+:[^\]]+\]/g, ' ').trim() || content,
  };
}

function startKick(target) {
  const t = parseKickTarget(target);
  if (!t) throw new Error('Не понял канал Kick. Напиши ник канала (например xqc) или ссылку kick.com/ник.');
  const st = state.kick;
  const ctl = new AbortController();
  let ws = null;
  st.stop = () => { ctl.abort(); try { ws && ws.close(); } catch (e) { /* уже закрыт */ } };
  (async () => {
    let backoff = 3000;
    let resolved = null;
    while (!ctl.signal.aborted) {
      try {
        setStatus('kick', 'connecting', '');
        if (!resolved) resolved = await kickResolve(t);
        st.label = resolved.name;
        const rt = await kickRealtime(resolved.channelId);
        await new Promise((resolve) => {
          ws = wsFactory(rt.url, { headers: { Origin: 'https://kick.com', 'User-Agent': UA } });
          let subscribed = false;
          ws.on('open', () => ws.send(JSON.stringify({ connect: { token: rt.token, name: 'js' }, id: 1 })));
          ws.on('message', (raw) => {
            String(raw).split('\n').forEach((line) => {
              if (!line.trim()) return;
              let j; try { j = JSON.parse(line); } catch (e) { return; }
              if (!Object.keys(j).length) { ws.send('{}'); return; } // ping сервера → pong
              if (j.id === 1 && j.connect) ws.send(JSON.stringify({ subscribe: { channel: 'chatrooms.' + resolved.chatroomId + '.v2' }, id: 2 }));
              else if (j.id === 2 && j.subscribe) { subscribed = true; backoff = 3000; setStatus('kick', 'on', ''); console.log('[Чат Kick] Подключено: ' + resolved.name); }
              else if (j.error) setStatus('kick', 'error', 'Kick: ' + (j.error.message || 'ошибка соединения с чатом'));
              else if (j.push && j.push.pub) {
                let env = j.push.pub.data;
                if (typeof env === 'string') { try { env = JSON.parse(env); } catch (e) { return; } }
                if (DEBUG) console.log('[Чат Kick] raw', JSON.stringify(env).slice(0, 400));
                if (!env || env.event !== 'App\\Events\\ChatMessageEvent') return;
                let d = env.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
                if (d && d.content != null) emit('kick', kickMessage(d));
              }
            });
          });
          ws.on('error', (e) => { if (!subscribed) setStatus('kick', 'error', 'Нет связи с Kick: ' + e.message); });
          ws.on('close', () => resolve());
        });
      } catch (e) {
        setStatus('kick', 'error', e.message);
        if (e.fatal) { st.running = false; return; } // повторять бессмысленно
      }
      if (ctl.signal.aborted) return;
      if (state.kick.status === 'on') setStatus('kick', 'connecting', 'Соединение с Kick прервалось, переподключаемся…');
      await sleep(backoff, ctl.signal);
      backoff = Math.min(backoff * 2, 30000);
    }
  })();
}

// ---------------------------------------------------------------- YouTube

const YT_API = process.env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3';
const YT_MIN_POLL_MS = Number(process.env.YOUTUBE_MIN_POLL_MS) || 8000;

function parseYouTubeVideoId(raw) {
  const s = String(raw || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(s);
  if (m) return m[1];
  m = /(?:youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/.exec(s);
  return m ? m[1] : null;
}

async function ytGet(path, params) {
  const qs = new URLSearchParams(params);
  let res;
  try { res = await fetchImpl(YT_API + path + '?' + qs.toString(), { headers: { Accept: 'application/json' } }); } catch (e) { const er = new Error('Нет связи с YouTube: ' + e.message); er.retry = true; throw er; }
  let j = null; try { j = await res.json(); } catch (e) { /* ниже по статусу */ }
  if (!res.ok) {
    const reason = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
    const er = new Error('YouTube: ' + ((j && j.error && j.error.message) || ('ответ ' + res.status)));
    if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') { er.message = 'У ключа YouTube закончилась дневная квота запросов (10 000 единиц). Чат продолжится после обновления квоты (около 10 утра по Москве) или с другим ключом.'; er.quota = true; er.retryLong = true; }
    else if (reason === 'keyInvalid' || res.status === 400 && /API key/i.test(er.message)) { er.message = 'YouTube не принял API-ключ — проверь, что он скопирован целиком и YouTube Data API v3 включён в проекте.'; er.fatal = true; }
    else if (reason === 'liveChatEnded' || reason === 'liveChatNotFound') { er.message = 'Чат этой трансляции закрыт или завершён.'; er.fatal = true; }
    else if (reason === 'liveChatDisabled') { er.message = 'У этой трансляции чат выключен.'; er.fatal = true; }
    else if (res.status >= 500) er.retry = true;
    else if (res.status === 403) er.fatal = true;
    throw er;
  }
  return j;
}

function ytMessage(item) {
  const sn = item.snippet || {}; const a = item.authorDetails || {};
  if (sn.type !== 'textMessageEvent' && sn.type !== 'superChatEvent' && sn.type !== 'superStickerEvent') return null;
  let text = sn.displayMessage || (sn.textMessageDetails && sn.textMessageDetails.messageText) || '';
  if (sn.type === 'superChatEvent' && sn.superChatDetails) {
    const sc = sn.superChatDetails;
    text = '[' + (sc.amountDisplayString || 'Super Chat') + '] ' + (sc.userComment || '');
  }
  return {
    id: String(item.id || ''),
    login: String(a.channelId || a.displayName || '').toLowerCase(),
    username: String(a.displayName || 'YouTube'),
    color: null,
    avatarUrl: a.profileImageUrl || null,
    roles: { mod: !!(a.isChatModerator || a.isChatOwner), vip: false },
    parts: [{ type: 'text', text }],
    text,
  };
}

function startYouTube(target, apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('Не указан API-ключ YouTube.');
  const videoId = parseYouTubeVideoId(target);
  if (!videoId) throw new Error('Не понял ссылку на трансляцию YouTube. Вставь ссылку на эфир (youtube.com/watch?v=… или youtube.com/live/…).');
  const st = state.youtube;
  const ctl = new AbortController();
  st.stop = () => ctl.abort();
  (async () => {
    let chatId = null; let pageToken = ''; let first = true; let wait = YT_MIN_POLL_MS; let fails = 0;
    setStatus('youtube', 'connecting', '');
    while (!ctl.signal.aborted) {
      try {
        if (!chatId) {
          const v = await ytGet('/videos', { part: 'liveStreamingDetails,snippet', id: videoId, key });
          const item = v.items && v.items[0];
          if (!item) { const er = new Error('Видео не найдено — проверь ссылку.'); er.fatal = true; throw er; }
          chatId = item.liveStreamingDetails && item.liveStreamingDetails.activeLiveChatId;
          if (!chatId) { const er = new Error('У этого видео сейчас нет активного чата: трансляция не идёт или уже закончилась.'); er.fatal = true; throw er; }
          st.label = (item.snippet && item.snippet.channelTitle) || videoId;
          console.log('[Чат YouTube] Подключено: ' + st.label);
        }
        const params = { liveChatId: chatId, part: 'snippet,authorDetails', maxResults: '200', key };
        if (pageToken) params.pageToken = pageToken;
        const r = await ytGet('/liveChat/messages', params);
        pageToken = r.nextPageToken || pageToken;
        fails = 0;
        setStatus('youtube', 'on', '');
        if (first) { first = false; } // старые сообщения чата при подключении не показываем
        else (r.items || []).forEach((it) => { if (DEBUG) console.log('[Чат YouTube] raw', JSON.stringify(it).slice(0, 300)); const m = ytMessage(it); if (m) emit('youtube', m); });
        // квота: 5 единиц за запрос, 10 000 в сутки — опрашиваем не чаще, чем разрешает YouTube, и не чаще раза в 8 секунд
        wait = Math.max(YT_MIN_POLL_MS, Number(r.pollingIntervalMillis) || 0);
      } catch (e) {
        if (ctl.signal.aborted) return;
        setStatus('youtube', 'error', e.message);
        if (e.fatal) { st.running = false; return; }
        fails += 1;
        wait = e.retryLong ? 15 * 60 * 1000 : Math.min(5000 * fails, 60000);
      }
      await sleep(wait, ctl.signal);
    }
  })();
}

// ---------------------------------------------------------------- VK Live

const VK_API = process.env.VK_LIVE_API_BASE || 'https://api.live.vkvideo.ru';
const VK_WS = process.env.VK_LIVE_WS || 'wss://pubsub.live.vkvideo.ru/connection/websocket?cf_protocol_version=v2';

function parseVkTarget(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?(live\.vkvideo\.ru|vkplay\.live|live\.vkplay\.ru)\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '');
  return /^[A-Za-z0-9_.-]{2,60}$/.test(s) ? s : null;
}

/** Текст части сообщения VK приходит как строка-JSON ["текст","unstyled",[]]. */
function vkText(content) {
  if (typeof content !== 'string') return '';
  if (content.startsWith('[')) { try { const a = JSON.parse(content); if (Array.isArray(a) && typeof a[0] === 'string') return a[0]; } catch (e) { /* обычная строка */ } }
  return content;
}

/** Достаёт из публикации Centrifugo объект сообщения чата (форма у VK менялась, поэтому ищем терпимо). */
function vkFindMessage(data) {
  let o = data;
  for (let i = 0; i < 4 && o && typeof o === 'object'; i++) {
    if (o.author && Array.isArray(o.data)) return o;
    o = o.data && !Array.isArray(o.data) ? o.data : (o.message || o.chatMessage || null);
  }
  return null;
}

function vkMessage(m) {
  const a = m.author || {};
  const parts = [];
  let text = '';
  (m.data || []).forEach((p) => {
    if (!p) return;
    if (p.type === 'smile') {
      const url = p.mediumUrl || p.smallUrl || p.largeUrl;
      if (url) { parts.push({ type: 'emote', name: p.name || 'smile', imageUrl: url }); return; }
    }
    let t = '';
    if (p.type === 'text') t = vkText(p.content);
    else if (p.type === 'link') t = p.url || vkText(p.content);
    else if (p.type === 'mention') t = '@' + (p.displayName || p.nick || p.name || '');
    else if (typeof p.content === 'string') t = vkText(p.content);
    if (t) { parts.push({ type: 'text', text: t }); text += t; }
  });
  const nickColors = ['#B0B0B0', '#F2565A', '#F0A33A', '#E3D454', '#61D161', '#33C9B6', '#4AA3F0', '#7B83F0', '#B77FEB', '#EB7FC1', '#F28F6B', '#8CD04F'];
  const col = Number.isInteger(a.nickColor) ? nickColors[a.nickColor % nickColors.length] : null;
  return {
    id: String(m.id || ''),
    login: String(a.nick || a.id || '').toLowerCase(),
    username: String(a.displayName || a.nick || 'VK'),
    color: col,
    avatarUrl: a.avatarUrl || null,
    roles: { mod: !!(a.isChatModerator || a.isChannelModerator || a.isOwner), vip: false },
    parts,
    text: text.trim(),
  };
}

function startVk(target) {
  const slug = parseVkTarget(target);
  if (!slug) throw new Error('Не понял канал VK Live. Напиши название канала (из адреса live.vkvideo.ru/название) или ссылку.');
  const st = state.vk;
  const ctl = new AbortController();
  let ws = null;
  st.stop = () => { ctl.abort(); try { ws && ws.close(); } catch (e) { /* уже закрыт */ } };
  (async () => {
    let backoff = 3000;
    let chatChannel = null;
    while (!ctl.signal.aborted) {
      try {
        setStatus('vk', 'connecting', '');
        if (!chatChannel) {
          let r;
          try { r = await fetchImpl(VK_API + '/v1/blog/' + encodeURIComponent(slug) + '/public_video_stream', { headers: { 'User-Agent': UA, Accept: 'application/json' } }); } catch (e) { throw new Error('Нет связи с VK Live: ' + e.message); }
          if (r.status === 404) { const er = new Error('Канал «' + slug + '» на VK Live не найден.'); er.fatal = true; throw er; }
          if (!r.ok) throw new Error('VK Live не отдал данные канала (ответ ' + r.status + ').');
          const j = await r.json();
          chatChannel = j.wsChatChannel || (j.chatSettings && j.chatSettings.channelId ? 'channel-chat:' + j.chatSettings.channelId : null);
          if (!chatChannel) { const er = new Error('У канала нет чата VK Live.'); er.fatal = true; throw er; }
          st.label = (j.user && (j.user.displayName || j.user.nick)) || slug;
        }
        let tr;
        try { tr = await fetchImpl(VK_API + '/v1/ws/connect', { headers: { 'User-Agent': UA } }); } catch (e) { throw new Error('Нет связи с VK Live: ' + e.message); }
        const token = (await tr.json()).token;
        if (!token) throw new Error('VK Live не выдал токен для чата.');
        await new Promise((resolve) => {
          ws = wsFactory(VK_WS, { headers: { Origin: 'https://live.vkvideo.ru', 'User-Agent': UA } });
          let subscribed = false;
          ws.on('open', () => ws.send(JSON.stringify({ connect: { token, name: 'js' }, id: 1 })));
          ws.on('message', (raw) => {
            String(raw).split('\n').forEach((line) => {
              if (!line.trim()) return;
              let j; try { j = JSON.parse(line); } catch (e) { return; }
              if (!Object.keys(j).length) { ws.send('{}'); return; } // ping сервера → pong
              if (j.id === 1 && j.connect) ws.send(JSON.stringify({ subscribe: { channel: chatChannel }, id: 2 }));
              else if (j.id === 2 && j.subscribe) { subscribed = true; backoff = 3000; setStatus('vk', 'on', ''); console.log('[Чат VK Live] Подключено: ' + st.label); }
              else if (j.error || (j.id === 2 && j.error)) setStatus('vk', 'error', 'VK Live: ' + ((j.error && j.error.message) || 'ошибка подписки на чат'));
              else if (j.push && j.push.pub) {
                if (DEBUG) console.log('[Чат VK Live] raw', JSON.stringify(j.push.pub).slice(0, 600));
                const msg = vkFindMessage(j.push.pub.data);
                if (msg) emit('vk', vkMessage(msg));
              }
            });
          });
          ws.on('error', (e) => { if (!subscribed) setStatus('vk', 'error', 'Нет связи с VK Live: ' + e.message); });
          ws.on('close', () => resolve());
        });
      } catch (e) {
        setStatus('vk', 'error', e.message);
        if (e.fatal) { st.running = false; return; }
      }
      if (ctl.signal.aborted) return;
      if (state.vk.status === 'on') setStatus('vk', 'connecting', 'Соединение с VK Live прервалось, переподключаемся…');
      await sleep(backoff, ctl.signal);
      backoff = Math.min(backoff * 2, 30000);
    }
  })();
}

// ---------------------------------------------------------------- общий интерфейс

function stop(platform) {
  const st = state[platform];
  if (!st) return;
  st.running = false;
  if (st.stop) { try { st.stop(); } catch (e) { /* уже остановлен */ } }
  st.stop = null; st.status = 'off'; st.lastError = ''; st.label = '';
}

/** Запускает чат платформы. opts.apiKey — только для YouTube. Бросает понятную ошибку, если цель/ключ заданы неверно. */
function start(platform, target, onMessage, opts) {
  if (!state[platform]) throw new Error('Неизвестная платформа чата');
  stop(platform);
  const st = state[platform];
  st.target = String(target || '').trim();
  st.onMessage = onMessage; st.count = 0;
  st.running = true;
  try {
    if (platform === 'kick') startKick(target);
    else if (platform === 'youtube') startYouTube(target, opts && opts.apiKey);
    else if (platform === 'vk') startVk(target);
  } catch (e) { st.running = false; st.status = 'off'; throw e; }
}

function info() {
  const out = {};
  PLATFORMS.forEach((p) => {
    const s = state[p];
    out[p] = { running: s.running, status: s.status, target: s.target, label: s.label, lastError: s.lastError, count: s.count };
  });
  return out;
}

module.exports = { start, stop, info, PLATFORMS, parseKickTarget, parseYouTubeVideoId, parseVkTarget, kickMessage, ytMessage, vkMessage, vkFindMessage, _setWsFactory, _setFetch };
