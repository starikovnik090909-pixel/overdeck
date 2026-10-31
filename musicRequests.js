// musicRequests.js — заказ музыки зрителями: !муз <название> → поиск клипа на YouTube → очередь → плеер для OBS (public/music.html).
// Без ключей API: поиск берёт первую подходящую ссылку со страницы выдачи YouTube. Видео можно по кнопке вывести на экран.
const fs = require('fs');
const path = require('path');

let DIR = __dirname;
const file = (n) => path.join(DIR, n);

const DEFAULTS = {
  enabled: true,
  commands: 'муз, music, song',     // команды заказа (без «!»)
  skipCommands: 'скип, skip',       // пропустить текущий трек (стример/модератор)
  who: 'everyone',                  // кто может заказывать: everyone | sub | vip | mod
  maxQueue: 20, perUser: 3, cooldown: 30, maxMinutes: 10,
  volume: 50,
  reply: true,                      // отвечать в чат от бота
  showVideo: false,                 // клип сейчас на экране
  autoShow: false,                  // показывать клип сразу при старте каждого трека
  view: 'clip',                     // что на экране: clip — клип, player — только плеер (без видео)
  line: 'bottom',                   // бегущая строка с названием у клипа: top | bottom | off
  skin: 1,                          // вид плеера 1…5
  showUser: true,                   // писать, кто заказал
  accent: '#e5484d',
  prioSub: false,                   // заказы подписчиков и VIP встают в очереди выше обычных
  pointsOn: false, pointsReward: '', // заказ за баллы канала: название награды (с полем «ввод текста»)
  donateOn: false, donateMinRub: 50, donatePrioRub: 200, donateBypass: true, // заказ донатом: от какой суммы, от какой — вне очереди, снимать ли лимиты
  proxy: '',                        // HTTP-прокси для поиска на YouTube, например http://127.0.0.1:10809
  blWords: '',                      // чёрный список слов (через запятую или с новой строки)
  blTracks: [],                     // чёрный список треков [{id, title}]
};
const BOOL = ['enabled', 'reply', 'showVideo', 'autoShow', 'showUser', 'prioSub', 'pointsOn', 'donateOn', 'donateBypass'];
const NUM = { maxQueue: [1, 100], perUser: [1, 20], cooldown: [0, 600], maxMinutes: [1, 60], volume: [0, 100], skin: [1, 5], donateMinRub: [1, 100000], donatePrioRub: [0, 100000] };
const ENUM = { who: ['everyone', 'sub', 'vip', 'mod'], view: ['clip', 'player'], line: ['top', 'bottom', 'off'] };

let cfg = Object.assign({}, DEFAULTS);
let searcher = defaultSearch;
let say = async () => false;
let onChange = () => {};
let seq = 0;
let useFile = true;
let current = null;          // { uid, id, title, channel, seconds, by, login }
let paused = false;
let pos = { uid: 0, t: 0, d: 0, at: 0 }; // позиция воспроизведения, её присылает страница плеера
let queue = [];
let history = [];
const lastAt = new Map();    // login → время последнего заказа

function sanitize(src, base) {
  const out = Object.assign({}, base), b = src || {};
  BOOL.forEach((k) => { if (typeof b[k] === 'boolean') out[k] = b[k]; });
  if (typeof b.pointsReward === 'string') out.pointsReward = b.pointsReward.replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
  if (typeof b.proxy === 'string') { const px = b.proxy.trim().slice(0, 200); out.proxy = !px || /^https?:\/\/[^\s]+$/i.test(px) ? px : (/^[^\s:\/]+:\d{2,5}$/.test(px) ? 'http://' + px : out.proxy); }
  if (typeof b.blWords === 'string') out.blWords = b.blWords.slice(0, 3000);
  if (Array.isArray(b.blTracks) && b.__keepTracks) out.blTracks = b.blTracks;
  ['commands', 'skipCommands'].forEach((k) => { if (typeof b[k] === 'string') out[k] = b[k].replace(/[!\r\n]/g, '').slice(0, 80); });
  if (typeof b.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.accent)) out.accent = b.accent.toLowerCase();
  Object.keys(NUM).forEach((k) => { if (b[k] != null && isFinite(Number(b[k]))) out[k] = Math.max(NUM[k][0], Math.min(NUM[k][1], Math.round(Number(b[k])))); });
  Object.keys(ENUM).forEach((k) => { if (ENUM[k].includes(b[k])) out[k] = b[k]; });
  return out;
}

/* ---------- Файлы: настройки, очередь, история ---------- */

let plays = [];              // все воспроизведения: { id, title, channel, by, login, at }
let saveT = 0, playsT = 0;
const PLAYS_MAX = 20000;
function readJson(name) { try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch (e) { return null; } }
function load() {
  const j = readJson('music_settings.json');
  cfg = j ? sanitize(Object.assign({}, j, { __keepTracks: true }), DEFAULTS) : Object.assign({}, DEFAULTS);
  const st = readJson('music_state.json');
  if (st) {
    const ok = (t) => t && t.id && t.title;
    queue = (Array.isArray(st.queue) ? st.queue : []).filter(ok).map((t) => Object.assign({ prio: 0 }, t));
    current = ok(st.current) ? st.current : null;
    seq = Math.max(Number(st.seq) || 0, current ? current.uid : 0, ...queue.map((q) => q.uid || 0));
  }
  const pl = readJson('music_plays.json');
  plays = pl && Array.isArray(pl.plays) ? pl.plays.slice(-PLAYS_MAX) : [];
}
function persist() { if (!useFile) return; try { fs.writeFileSync(file('music_settings.json'), JSON.stringify(cfg, null, 2)); } catch (e) { /* не критично */ } }
function saveNow() {
  if (!useFile) return;
  try { fs.writeFileSync(file('music_state.json'), JSON.stringify({ seq, current, queue })); } catch (e) { /* не критично */ }
}
function savePlaysNow() { if (!useFile) return; try { fs.writeFileSync(file('music_plays.json'), JSON.stringify({ plays })); } catch (e) { /* не критично */ } }
function changed() { if (useFile) { clearTimeout(saveT); saveT = setTimeout(saveNow, 400); } onChange(); }
function flush() { clearTimeout(saveT); clearTimeout(playsT); saveNow(); savePlaysNow(); }

function init(opts) {
  const o = opts || {};
  if (o.search) searcher = o.search;
  if (o.say) say = o.say;
  if (o.onChange) onChange = o.onChange;
  if (o.dir) DIR = o.dir;
  useFile = !o.noFile;
  if (useFile) load();
}
function reset() { current = null; paused = false; queue = []; history = []; plays = []; lastAt.clear(); cfg = Object.assign({}, DEFAULTS); cfg.blTracks = []; }
function getSettings() { return Object.assign({}, cfg, { blTracks: cfg.blTracks.slice() }); }
function update(patch) { cfg = sanitize(patch, cfg); persist(); onChange(); return getSettings(); }

/* ---------- Поиск на YouTube ---------- */

function parseSeconds(t) {
  if (!t) return 0;
  const p = String(t).split(':').map((n) => parseInt(n, 10));
  if (p.some((n) => !isFinite(n))) return 0;
  return p.reduce((a, n) => a * 60 + n, 0);
}
function videoIdFrom(text) {
  const m = String(text || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?(?:[^\s]*&)?v=)([A-Za-z0-9_-]{11})/i);
  return m ? m[1] : '';
}
/** Первый подходящий ролик из ytInitialData страницы выдачи (без рекламы, плейлистов и прямых эфиров). */
function parseResults(html) {
  const m = String(html || '').match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
  if (!m) return [];
  let data; try { data = JSON.parse(m[1]); } catch (e) { return []; }
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object' || out.length >= 8) return;
    if (n.videoRenderer && n.videoRenderer.videoId) {
      const v = n.videoRenderer;
      const title = ((v.title && v.title.runs) || []).map((r) => r.text).join('') || (v.title && v.title.simpleText) || '';
      const ch = ((v.ownerText && v.ownerText.runs) || []).map((r) => r.text).join('');
      const len = v.lengthText && v.lengthText.simpleText;
      if (len) out.push({ id: v.videoId, title, channel: ch, seconds: parseSeconds(len) });
      return;
    }
    if (Array.isArray(n)) n.forEach(walk); else Object.keys(n).forEach((k) => walk(n[k]));
  })(data);
  return out;
}
/** Скачать страницу; если задан прокси (HTTP CONNECT) — через него, иначе напрямую. */
function getText(url, headers, proxy, ms) {
  if (!proxy) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), ms);
    return fetch(url, { signal: ctl.signal, headers }).then(async (r) => ({ status: r.status, body: r.ok ? await r.text() : '' })).finally(() => clearTimeout(to));
  }
  const http = require('http'), https = require('https'), tls = require('tls');
  return new Promise((resolve, reject) => {
    const u = new URL(url), px = new URL(proxy);
    let done = false;
    const fin = (e, v) => { if (done) return; done = true; clearTimeout(to); e ? reject(e) : resolve(v); };
    const to = setTimeout(() => { fin(new Error('прокси не отвечает')); try { req.destroy(); } catch (e) { /* уже закрыт */ } }, ms);
    const auth = px.username ? { 'Proxy-Authorization': 'Basic ' + Buffer.from(decodeURIComponent(px.username) + ':' + decodeURIComponent(px.password)).toString('base64') } : {};
    const req = (px.protocol === 'https:' ? https : http).request({ host: px.hostname, port: px.port || (px.protocol === 'https:' ? 443 : 80), method: 'CONNECT', path: u.hostname + ':443', headers: Object.assign({ Host: u.hostname + ':443' }, auth) });
    req.on('error', fin);
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return fin(new Error('прокси ответил ' + res.statusCode)); }
      const sock = tls.connect({ socket, servername: u.hostname });
      sock.on('error', fin);
      const rq = https.request({ host: u.hostname, path: u.pathname + u.search, method: 'GET', headers, createConnection: () => sock }, (r) => {
        const chunks = []; r.on('data', (c) => chunks.push(c));
        r.on('end', () => { sock.destroy(); fin(null, { status: r.statusCode, body: r.statusCode === 200 ? Buffer.concat(chunks).toString('utf8') : '' }); });
        r.on('error', fin);
      });
      rq.on('error', fin); rq.end();
    });
    req.end();
  });
}
async function defaultSearch(query) {
  const px = cfg.proxy || '';
  const hd = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9' };
  const id = videoIdFrom(query);
  if (id) {
    let j = null;
    try { const r = await getText('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), hd, px, 10000); j = r.body ? JSON.parse(r.body) : null; } catch (e) { /* название необязательно */ }
    return [{ id, title: (j && j.title) || 'Видео YouTube', channel: (j && j.author_name) || '', seconds: 0 }];
  }
  const r = await getText('https://www.youtube.com/results?hl=ru&gl=RU&search_query=' + encodeURIComponent(query), hd, px, 12000);
  if (r.status !== 200) throw new Error('YouTube ответил ' + r.status);
  return parseResults(r.body);
}

/* ---------- Чёрный список ---------- */

function wordList() { return String(cfg.blWords || '').toLowerCase().split(/[,\n;]+/).map((w) => w.trim()).filter(Boolean); }
function badWord(...texts) { const ws = wordList(); if (!ws.length) return ''; const t = texts.join(' \n ').toLowerCase(); return ws.find((w) => t.includes(w)) || ''; }
function isBanned(id) { return cfg.blTracks.some((t) => t.id === id); }
function banTrack(id, title) {
  id = String(id || ''); if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) throw new Error('Некорректный ролик.');
  if (!isBanned(id)) { cfg.blTracks.push({ id, title: String(title || '').slice(0, 200) }); cfg.blTracks = cfg.blTracks.slice(-300); persist(); }
  queue = queue.filter((q) => q.id !== id);
  if (current && current.id === id) startNext(); else changed();
  return getSettings();
}
function unbanTrack(id) { cfg.blTracks = cfg.blTracks.filter((t) => t.id !== id); persist(); onChange(); return getSettings(); }

/* ---------- Очередь ---------- */

function mkItem(hit, by, login, prio) { return { uid: ++seq, id: hit.id, title: hit.title, channel: hit.channel || '', seconds: hit.seconds || 0, by: by || '', login: login || '', prio: prio || 0 }; }
function recordPlay(t) {
  plays.push({ id: t.id, title: t.title, channel: t.channel || '', by: t.by || '', login: t.login || '', at: Date.now() });
  if (plays.length > PLAYS_MAX) plays = plays.slice(-PLAYS_MAX);
  if (useFile) { clearTimeout(playsT); playsT = setTimeout(savePlaysNow, 2000); }
}
function startNext() {
  if (current) history.unshift(current), history = history.slice(0, 10);
  current = queue.shift() || null;
  paused = false;
  if (current) { recordPlay(current); if (cfg.autoShow) cfg.showVideo = true; }
  changed();
  return current;
}
/** Куда встать в очереди: после последнего заказа с таким же или более высоким приоритетом. */
function insert(item) {
  let at = 0;
  queue.forEach((q, i) => { if ((q.prio || 0) >= item.prio) at = i + 1; });
  queue.splice(at, 0, item);
}
function enqueue(item) { if (!current) { queue.push(item); startNext(); } else { insert(item); changed(); } return item; }
function ended(uid) { if (current && (uid == null || Number(uid) === current.uid)) startNext(); }
function skip() { if (current) startNext(); else changed(); }
function remove(uid) { const n = queue.length; queue = queue.filter((q) => q.uid !== Number(uid)); if (queue.length !== n) changed(); }
function clear() { queue = []; changed(); }
function move(uid, to) {
  const i = queue.findIndex((q) => q.uid === Number(uid)); if (i < 0) return;
  const [it] = queue.splice(i, 1); queue.splice(Math.max(0, Math.min(queue.length, Number(to) || 0)), 0, it); changed();
}
function setPos(uid, t, d) { if (current && Number(uid) === current.uid) pos = { uid: current.uid, t: Math.max(0, Number(t) || 0), d: Math.max(0, Number(d) || 0), at: Date.now() }; }
function setPaused(p) { paused = !!p; onChange(); }
function setShow(v) { cfg.showVideo = !!v; persist(); onChange(); return cfg.showVideo; }
function stop() { queue = []; if (current) history.unshift(current), history = history.slice(0, 10); current = null; paused = false; changed(); }
function state() {
  return { settings: getSettings(), paused, pos: current && pos.uid === current.uid ? pos : null, current, queue: queue.slice(), history: history.slice(), ts: Date.now() };
}
const fmt = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

/* ---------- Заказ: общая часть для чата, баллов и доната ---------- */

function pickHit(hits) {
  return (hits || []).find((h) => h && h.id && !isBanned(h.id) && !badWord(h.title, h.channel) && (!h.seconds || h.seconds <= cfg.maxMinutes * 60)) || null;
}
/** Ручной заказ из админки: текст, ссылка или название. */
async function addByQuery(query, by) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) throw new Error('Введи название или ссылку.');
  const hits = await searcher(q);
  const hit = pickHit(hits);
  if (!hit) throw new Error('Ничего не нашлось (или трек в чёрном списке).');
  return enqueue(mkItem(hit, by || 'Стример', '', 3));
}
/** opts: { query, name, login, roles, source: 'chat'|'points'|'donate', prio, free } — free: лимиты и кулдаун не применяются. */
async function place(o) {
  const name = o.name || o.login || '', login = String(o.login || name).toLowerCase();
  const reply = async (t) => { if (cfg.reply) await say(t); };
  const q = String(o.query || '').trim().slice(0, 200);
  if (!q) { await reply(`@${name}, напиши название песни после команды.`); return false; }
  const w = badWord(q);
  if (w) { await reply(`@${name}, такой запрос запрещён в заказе музыки.`); return false; }
  if (!o.free) {
    const wait = Math.ceil(((lastAt.get(login) || 0) + cfg.cooldown * 1000 - Date.now()) / 1000);
    if (wait > 0) { await reply(`@${name}, подожди ещё ${wait} с перед новым заказом.`); return false; }
    if (queue.filter((x) => x.login === login).length >= cfg.perUser) { await reply(`@${name}, у тебя уже ${cfg.perUser} трека в очереди.`); return false; }
    if (queue.length >= cfg.maxQueue) { await reply(`@${name}, очередь заполнена, попробуй позже.`); return false; }
  }
  lastAt.set(login, Date.now());
  let hits;
  try { hits = await searcher(q); } catch (e) { await reply(`@${name}, не получилось найти трек (YouTube не отвечает — стримеру нужен VPN или прокси).`); return false; }
  const hit = pickHit(hits);
  if (!hit) { await reply(`@${name}, ничего не нашлось по запросу «${q.slice(0, 60)}» (нет такого клипа, он длиннее ${cfg.maxMinutes} мин или в чёрном списке).`); return false; }
  const playingNow = !current;
  const item = enqueue(mkItem(hit, name, login, o.prio || 0));
  const place_ = queue.findIndex((x) => x.uid === item.uid) + 1;
  const tail = o.source === 'donate' ? ' (за донат)' : o.source === 'points' ? ' (за баллы)' : '';
  await reply(playingNow ? `▶ Играет: ${item.title} (заказ @${name})${tail}` : `➕ @${name}, в очереди №${place_}: ${item.title}${item.seconds ? ' [' + fmt(item.seconds) + ']' : ''}${tail}`);
  return true;
}

/* ---------- Чат, баллы, донаты ---------- */

function words(s) { return String(s || '').toLowerCase().split(/[,\s]+/).filter(Boolean); }
function roleOk(roles) {
  const r = roles || {};
  if (r.broadcaster || r.mod) return true;
  if (cfg.who === 'everyone') return true;
  if (cfg.who === 'vip') return !!(r.vip || r.sub);
  if (cfg.who === 'sub') return !!r.sub;
  return false;
}
/** Сообщение из чата. Возвращает true, если это была команда музыки. */
async function onChat(m) {
  const text = String((m && m.message) || '').trim();
  const mm = text.match(/^!(\S+)\s*(.*)$/s);
  if (!mm || !cfg.enabled) return false;
  const cmd = mm[1].toLowerCase(), arg = mm[2].trim();
  const roles = m.roles || {};
  const reply = async (t) => { if (cfg.reply) await say(t); };
  const name = m.name || m.login || '';
  if (words(cfg.skipCommands).includes(cmd)) {
    if (!(roles.broadcaster || roles.mod)) return true;
    if (!current) return true;
    const t = current.title; skip(); await reply(`⏭ Пропущено: ${t}`); return true;
  }
  if (cmd === 'отмена' || cmd === 'cancel') {
    const login = String(m.login || name).toLowerCase();
    const mine = queue.filter((q) => q.login === login).pop();
    if (!mine) { await reply(`@${name}, у тебя нет заказов в очереди.`); return true; }
    remove(mine.uid); await reply(`🗑 @${name}, заказ «${mine.title}» убран из очереди.`); return true;
  }
  if (!words(cfg.commands).includes(cmd)) return false;
  if (!roleOk(roles)) { await reply(`@${name}, заказ музыки сейчас доступен не всем.`); return true; }
  const privileged = !!(roles.broadcaster || roles.mod);
  const prio = cfg.prioSub && (roles.sub || roles.vip) ? 1 : 0;
  await place({ query: arg, name, login: m.login, roles, source: 'chat', prio, free: privileged });
  return true;
}
/** Выдача награды за баллы канала (EventSub). Название награды должно совпадать с настройкой; текст зритель вводит в поле награды. */
async function onPoints(e) {
  if (!cfg.enabled || !cfg.pointsOn || !cfg.pointsReward) return false;
  if (String(e.reward || '').trim().toLowerCase() !== cfg.pointsReward.trim().toLowerCase()) return false;
  await place({ query: e.input, name: e.name || e.login, login: e.login, source: 'points', prio: 1, free: true });
  return true;
}
/** Донат: текст сообщения — название песни (можно с «!муз» в начале). */
async function onDonation(d) {
  if (!cfg.enabled || !cfg.donateOn) return false;
  const rub = Number(d.rub) || 0;
  if (rub < cfg.donateMinRub) return false;
  let q = String(d.message || '').trim();
  const mm = q.match(/^!(\S+)\s*(.*)$/s);
  if (mm && words(cfg.commands).includes(mm[1].toLowerCase())) q = mm[2].trim();
  if (!q) return false;
  const top = cfg.donatePrioRub > 0 && rub >= cfg.donatePrioRub;
  await place({ query: q, name: d.username, login: d.username, source: 'donate', prio: top ? 2 : 1, free: !!cfg.donateBypass });
  return true;
}

/* ---------- История и чарт ---------- */

/** since — момент (мс), с которого считать; 0 — за всё время. */
function stats(since) {
  const s = Number(since) || 0;
  const list = plays.filter((p) => p.at >= s);
  const tr = new Map(), us = new Map();
  list.forEach((p) => {
    const t = tr.get(p.id) || { id: p.id, title: p.title, channel: p.channel, count: 0, last: 0 };
    t.count++; t.last = Math.max(t.last, p.at); t.title = p.title; tr.set(p.id, t);
    if (p.login) { const u = us.get(p.login) || { login: p.login, name: p.by || p.login, count: 0 }; u.count++; us.set(p.login, u); }
  });
  const by = (a, b) => b.count - a.count || b.last - a.last;
  return {
    total: list.length,
    tracks: [...tr.values()].sort(by).slice(0, 30),
    users: [...us.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    recent: plays.slice(-100).reverse(),
  };
}
async function sayChart(since) {
  const st = stats(since).tracks.slice(0, 5);
  if (!st.length) return false;
  return say('🏆 Чарт: ' + st.map((t, i) => `${i + 1}) ${t.title.slice(0, 40)}${t.count > 1 ? ' ×' + t.count : ''}`).join(' · '));
}

async function checkYoutube() {
  const t0 = Date.now();
  try { const h = await searcher('music'); return { ok: h.length > 0, ms: Date.now() - t0, error: h.length ? '' : 'YouTube открылся, но ничего не нашлось.' }; }
  catch (e) { return { ok: false, ms: Date.now() - t0, error: String((e && e.message) || e) }; }
}

module.exports = { checkYoutube, DEFAULTS, init, reset, getSettings, update, state, addByQuery, onChat, onPoints, onDonation, ended, setPos, skip, remove, clear, move, setPaused, setShow, stop, banTrack, unbanTrack, stats, sayChart, flush, parseResults, videoIdFrom, parseSeconds };
