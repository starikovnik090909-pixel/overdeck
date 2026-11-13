'use strict';
// Интеграция с ВКонтакте.
//  Анонс старта стрима: пост на стене сообщества и/или сообщение в беседу сообщества.
//  События (донаты, рейды, подписки, фолловеры) и итог стрима: сообщения в беседу (стену не засоряем).
// Настройки лежат в vk.json (в .gitignore), токен наружу не отдаётся.
const fs = require('fs');
const path = require('path');
const notifyUi = require('./notify');

const FILE = path.join(__dirname, 'vk.json');
const API = 'https://api.vk.com/method/';
const V = '5.199';
const COOLDOWN_MS = 30 * 60 * 1000;

const DEFAULTS = {
  enabled: false,
  token: '',                 // ключ доступа сообщества
  groupId: '',               // число, без минуса
  wall: true,                // анонс постом на стену
  chat: '',                  // номер беседы (1, 2, …) или peer_id; пусто = без беседы
  pin: false,                // закреплять анонс на стене
  photo: true,               // прикладывать скриншот эфира к анонсу
  announce: true,
  template: '🔴 {channel} в эфире!\n{title}',
  events: { donation: true, raid: true, sub: true, follow: false, end: true },
  minDonation: 0,
  lastSentAt: 0,
  lastError: '',
};

let cfg = JSON.parse(JSON.stringify(DEFAULTS));
let ext = { channel: () => '', getInfo: async () => null };
let live = null, liveTimer = null, lastAnnounceAt = 0;
const recent = new Map();

function load() {
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); cfg = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...j, events: { ...DEFAULTS.events, ...(j.events || {}) } }; } catch (e) { /* файла ещё нет */ }
}
function save() { try { fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 }); } catch (e) { console.warn('[VK] не удалось сохранить:', e.message); } }

const hint = (s) => (s ? '…' + String(s).slice(-4) : '');
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('ru-RU');
function fmtDur(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`; }
function render(tpl, v) { return String(tpl || '').replace(/\{(title|game|channel|url)\}/g, (m, k) => v[k] == null ? '' : v[k]); }
const twitchUrl = (login) => 'https://twitch.tv/' + (login || ext.channel() || '');

const gid = () => (/^\d{3,12}$/.test(String(cfg.groupId)) ? String(cfg.groupId) : '');
const peers = () => String(cfg.chat || '').split(/[\s,;]+/).map(Number).filter((n) => n > 0).map((n) => (n >= 2000000000 ? n : 2000000000 + n)).filter((n, i, a) => a.indexOf(n) === i).slice(0, 10);
const peer = () => peers().length; // есть ли хоть одна беседа
const ready = () => !!(cfg.token && gid());

const ERR = {
  5: 'ВК не принял ключ доступа. Создай новый в настройках сообщества → Работа с API.',
  7: 'У ключа нет нужного права. Отметь «Управление сообществом», «Стена», «Фотографии» и «Сообщения сообщества».',
  9: 'ВК просит не слать так часто, попробуй позже.',
  14: 'ВК просит ввести капчу. Попробуй позже.',
  15: 'ВК отказал в доступе: проверь права ключа и что бот добавлен в беседу.',
  27: 'Ключ подходит только для сообщества, а не для пользователя.',
  100: 'ВК не принял параметры: проверь ID сообщества и номер беседы.',
  901: 'Сообщество не может писать этому пользователю или в эту беседу.',
  917: 'У бота нет доступа к беседе: добавь его и сделай администратором.',
  925: 'Бот не администратор беседы: сделай его администратором.',
};
function netErr(e) {
  const m = (e && e.cause && e.cause.code) || (e && e.name) || '';
  if (/Timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|UND_ERR|fetch failed/i.test(m + (e && e.message))) return 'Не удалось связаться с ВК. Проверь интернет, VPN или DNS.';
  return (e && e.message) || String(e);
}

/** Вызов метода ВК. Параметры уходят в теле запроса, не в адресе. */
async function call(method, params) {
  const body = new URLSearchParams({ v: V, access_token: cfg.token });
  for (const [k, v] of Object.entries(params || {})) body.set(k, String(v));
  let r, j, txt = '';
  const go = async () => {
    r = await fetch(API + method, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Overdeck/1.0' }, body, signal: AbortSignal.timeout(12000) });
    txt = await r.text();
  };
  try {
    try { await go(); } catch (e) { await new Promise((ok) => setTimeout(ok, 800)); await go(); } // одна повторная попытка при сетевом сбое
  } catch (e) { cfg.lastError = netErr(e); save(); throw new Error(cfg.lastError); }
  try { j = JSON.parse(txt); } catch (e) {
    cfg.lastError = 'ВК ответил не так, как ждали (код ' + (r && r.status) + '): ' + clip(String(txt).replace(/\s+/g, ' ').trim(), 120) + '. Возможно, ВК открывается через прокси, VPN или антивирус, которые вмешиваются в запрос.';
    save(); throw new Error(cfg.lastError);
  }
  if (j && j.error) {
    const c = j.error.error_code;
    cfg.lastError = (ERR[c] ? ERR[c] + (c === 100 && j.error.error_msg ? ' (ВК пишет: ' + j.error.error_msg + ')' : '') : ('ВК ответил ошибкой ' + c + (j.error.error_msg ? ': ' + j.error.error_msg : '')));
    save(); throw new Error(cfg.lastError);
  }
  cfg.lastSentAt = Date.now(); cfg.lastError = ''; save();
  return j && j.response;
}

const rnd = () => Math.floor(Math.random() * 2147483000) + 1;
async function toChat(text, att, only) { const list = only ? [only] : peers(); let last, err; for (const id of list) try { last = await call('messages.send', { peer_id: id, random_id: rnd(), message: clip(text, 3900), disable_mentions: 1, dont_parse_links: 0, ...(att ? { attachment: att } : {}) }); } catch (e) { err = err || e; } if (err) throw err; return last; }
function toWall(text, att) { return call('wall.post', { owner_id: -Number(gid()), from_group: 1, message: clip(text, 15000), ...(att ? { attachments: att } : {}) }); } // ссылка в тексте: ВК сам делает превью, вложением её слать не нужно (ВК отвечал ошибкой 100)

// ---------- скриншот эфира ----------
async function download(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 2000 ? buf : null;
  } catch (e) { return null; }
}
/** Загружает картинку на сервер ВК и возвращает строку-вложение photo<owner>_<id>. Любая неудача: null (анонс уйдёт без картинки). */
async function uploadPhoto(img, forChat, pid) {
  try {
    const srv = await call(forChat ? 'photos.getMessagesUploadServer' : 'photos.getWallUploadServer', forChat ? { peer_id: pid } : { group_id: gid() });
    if (!srv || !srv.upload_url) return null;
    const fd = new FormData(); fd.append('photo', new Blob([img], { type: 'image/jpeg' }), 'stream.jpg');
    const up = await (await fetch(srv.upload_url, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) })).json();
    const saved = await call(forChat ? 'photos.saveMessagesPhoto' : 'photos.saveWallPhoto', forChat ? { photo: up.photo, server: up.server, hash: up.hash } : { group_id: gid(), photo: up.photo, server: up.server, hash: up.hash });
    const ph = Array.isArray(saved) ? saved[0] : saved && saved.items && saved.items[0];
    return ph && ph.id ? 'photo' + ph.owner_id + '_' + ph.id : null;
  } catch (e) { console.warn('[VK] картинка не загрузилась:', e.message); return null; }
}

const safe = (p) => p.catch((e) => console.warn('[VK]', e.message));
const on = () => cfg.enabled && ready();
function once(key) { const n = Date.now(); for (const [k, t] of recent) if (n - t > 8000) recent.delete(k); if (recent.has(key)) return false; recent.set(key, n); return true; }

async function announce() {
  if (!cfg.wall && !peer()) throw new Error('Включи пост на стену или укажи номер беседы.');
  const d = await ext.getInfo({});
  const info = d && d.info, channel = (d && d.channel) || ext.channel();
  const v = { channel, title: info ? info.title : 'Стрим начался', game: info ? info.game_name : '', url: twitchUrl(channel) };
  const text = render(cfg.template, v) + (v.game ? '\nКатегория: ' + v.game : '') + '\n' + v.url;
  let img = null, shot = false;
  if (cfg.photo && info && info.thumbnail_url) img = await download(info.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') + '?t=' + Date.now());
  try {
    if (cfg.wall) { const a = img ? await uploadPhoto(img, false) : null; shot = shot || !!a; const w = await toWall(text, a); if (cfg.pin && w && w.post_id) await call('wall.pin', { owner_id: -Number(gid()), post_id: w.post_id }).catch(() => {}); }
    for (const id of peers()) { const a = img ? await uploadPhoto(img, true, id) : null; shot = shot || !!a; await toChat(text, a, id); }
  } catch (e) { notifyUi.emit('vk.fail', { reason: e.message }); throw e; }
  notifyUi.emit('vk.sent', {});
  return { live: !!info, photo: shot };
}

function onStreamStart() {
  startTracking();
  if (!on() || !cfg.announce) return;
  if (Date.now() - lastAnnounceAt < COOLDOWN_MS) return;
  lastAnnounceAt = Date.now();
  safe(announce());
}

function startTracking() {
  live = { startedAt: Date.now(), title: '', games: [], peak: 0, follows: 0, subs: 0, donations: 0, donRub: 0 };
  clearInterval(liveTimer);
  const tick = async () => {
    try { const d = await ext.getInfo({ light: true }); if (d && d.info && live) { live.peak = Math.max(live.peak, Number(d.info.viewer_count) || 0); live.title = d.info.title || live.title; const g = d.info.game_name; if (g && (!live.games.length || live.games[live.games.length - 1] !== g)) live.games.push(g); } } catch (e) { /* сеть моргнула */ }
  };
  tick(); liveTimer = setInterval(tick, 60000); if (liveTimer.unref) liveTimer.unref();
}

function sendEvent(text) { if (peer()) safe(toChat(text)); }

function onEvent(kind, data) {
  data = data || {};
  if (live) {
    if (kind === 'follow') live.follows++;
    if (kind === 'sub' && data.type !== 'resub') live.subs += data.type === 'gift' ? (Number(data.count) || 1) : 1;
  }
  if (!on() || !cfg.events[kind] || !peer()) return;
  const who = clip(data.username || 'Аноним', 60);
  if (!once(kind + ':' + who + ':' + (data.viewers || data.type || ''))) return;
  let t;
  if (kind === 'raid') t = `⚔️ Рейд! ${who} привёл ${fmtNum(data.viewers)} зрителей`;
  else if (kind === 'sub') {
    t = data.type === 'gift' ? `🎁 ${who} подарил подписок: ${fmtNum(data.count || 1)}` : data.type === 'resub' ? `⭐ Продление подписки: ${who}` + (data.months ? ` · ${fmtNum(data.months)} мес.` : '') : `💜 Новая подписка: ${who}`;
    if (data.message) t += '\n«' + clip(data.message, 300).replace(/\n/g, ' ') + '»';
  } else if (kind === 'follow') t = `👋 Новый фолловер: ${who}`;
  else return;
  sendEvent(t);
}

function onDonation(rec, rub) {
  rec = rec || {};
  const r = Number(rub) || 0;
  if (live) { live.donations++; live.donRub += r; }
  if (!on() || !cfg.events.donation || !peer()) return;
  if (r < (Number(cfg.minDonation) || 0)) return;
  const who = clip(rec.username || 'Аноним', 60);
  if (!once('don:' + who + ':' + rec.amount + ':' + (rec.id || ''))) return;
  let t = `💸 Донат: ${who} · ${fmtNum(rec.amount)} ${clip(rec.currency || '₽', 6)}`;
  if (rec.message) t += '\n«' + clip(rec.message, 400).replace(/\n/g, ' ') + '»';
  sendEvent(t);
}

function summaryText(L) {
  const out = ['⚫ Стрим закончился'];
  if (L.title) out.push(clip(L.title, 200));
  out.push('Длительность: ' + fmtDur(Date.now() - L.startedAt));
  if (L.peak) out.push('Пик зрителей: ' + fmtNum(L.peak));
  if (L.games.length) out.push('Категории: ' + clip(L.games.join(' → '), 300));
  const ev = [];
  if (L.follows) ev.push(`+${fmtNum(L.follows)} фолловеров`);
  if (L.subs) ev.push(`подписок: ${fmtNum(L.subs)}`);
  if (L.donations) ev.push(`донатов: ${fmtNum(L.donations)}${L.donRub ? ` на ${fmtNum(L.donRub)} ₽` : ''}`);
  if (ev.length) out.push('Сообщество: ' + ev.join(' · '));
  return out.join('\n');
}
function onStreamEnd() {
  const L = live; live = null; clearInterval(liveTimer); liveTimer = null;
  if (L && on() && cfg.events.end && peer() && Date.now() - L.startedAt > 60000) safe(toChat(summaryText(L)));
}

// ---------- API для админки ----------
function publicState() {
  return {
    enabled: cfg.enabled, hasToken: !!cfg.token, tokenHint: hint(cfg.token), groupId: cfg.groupId, wall: cfg.wall, chat: cfg.chat, photo: cfg.photo, pin: cfg.pin,
    announce: cfg.announce, template: cfg.template, defaultTemplate: DEFAULTS.template, events: { ...cfg.events }, minDonation: cfg.minDonation,
    lastSentAt: cfg.lastSentAt, lastError: cfg.lastError,
  };
}
function update(b) {
  b = b || {};
  if (typeof b.token === 'string' && b.token.trim()) { const t = b.token.trim(); if (!/^[\w.-]{20,300}$/.test(t)) throw new Error('Это не похоже на ключ доступа сообщества.'); cfg.token = t; }
  if (b.clearToken) { cfg.token = ''; cfg.enabled = false; }
  if (typeof b.groupId === 'string') {
    const g = b.groupId.trim().replace(/^-/, '');
    if (g && !/^\d{3,12}$/.test(g)) throw new Error('ID сообщества: только цифры (например 123456789).');
    cfg.groupId = g;
  }
  if (typeof b.chat === 'string') {
    const c = b.chat.trim();
    if (c && !/^\d{1,12}([\s,;]+\d{1,12})*$/.test(c)) throw new Error('Номера бесед: только цифры через запятую (например 1, 2, 5).');
    cfg.chat = c;
  }
  if (typeof b.enabled === 'boolean') cfg.enabled = b.enabled;
  if (typeof b.wall === 'boolean') cfg.wall = b.wall;
  if (typeof b.photo === 'boolean') cfg.photo = b.photo;
  if (typeof b.pin === 'boolean') cfg.pin = b.pin;
  if (typeof b.announce === 'boolean') cfg.announce = b.announce;
  if (typeof b.template === 'string') cfg.template = clip(b.template, 1000) || DEFAULTS.template;
  if (b.events && typeof b.events === 'object') for (const k of Object.keys(DEFAULTS.events)) if (typeof b.events[k] === 'boolean') cfg.events[k] = b.events[k];
  if (b.minDonation != null) cfg.minDonation = Math.max(0, Math.min(1e7, Number(b.minDonation) || 0));
  save();
  return publicState();
}

async function test() {
  if (!ready()) throw new Error('Сначала вставь ключ и ID сообщества.');
  return announce();
}
async function testEnd() {
  if (!ready()) throw new Error('Сначала вставь ключ и ID сообщества.');
  if (!peer()) throw new Error('Итог уходит в беседу: укажи её номер.');
  await toChat(summaryText({ startedAt: Date.now() - 95 * 60000, title: 'Пример итога стрима', games: ['Resident Evil 4'], peak: 128, follows: 12, subs: 3, donations: 2, donRub: 800 }));
  return { ok: true };
}
async function check() {
  if (!cfg.token) throw new Error('Вставь ключ доступа.');
  if (!gid()) throw new Error('Вставь ID сообщества.');
  const r = await call('groups.getById', { group_id: gid() });
  const g = (r && (r.groups ? r.groups[0] : r[0])) || {};
  return { name: g.name || ('club' + gid()) };
}

/** Беседы, в которых состоит сообщество: номер и название, чтобы не гадать с номером. */
async function chats() {
  if (!ready()) throw new Error('Сначала вставь ключ и ID сообщества.');
  const r = await call('messages.getConversations', { count: 200, filter: 'all' });
  const out = [];
  for (const it of (r && r.items) || []) {
    const c = it.conversation || {}, p = c.peer || {};
    if (p.type === 'chat') out.push({ id: p.local_id || (p.id - 2000000000), title: clip((c.chat_settings && c.chat_settings.title) || 'Без названия', 60) });
  }
  return { chats: out.sort((a, b) => a.id - b.id) };
}

function init(extra) { ext = { ...ext, ...extra }; load(); }

module.exports = { init, onStreamStart, onStreamEnd, onEvent, onDonation, publicState, update, test, testEnd, check, chats, _summaryText: summaryText, _cfg: () => cfg };
