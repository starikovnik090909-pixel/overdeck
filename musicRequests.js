// musicRequests.js — заказ музыки зрителями: !муз <название> → поиск клипа на YouTube → очередь → плеер для OBS (public/music.html).
// Без ключей API: поиск берёт первую подходящую ссылку со страницы выдачи YouTube. Видео можно по кнопке вывести на экран.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'music_settings.json');

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
  skin: 1,                          // вид плеера 1…13
  showUser: true,                   // писать, кто заказал
  accent: '#e5484d',
};
const BOOL = ['enabled', 'reply', 'showVideo', 'autoShow', 'showUser'];
const NUM = { maxQueue: [1, 100], perUser: [1, 20], cooldown: [0, 600], maxMinutes: [1, 60], volume: [0, 100], skin: [1, 13] };
const ENUM = { who: ['everyone', 'sub', 'vip', 'mod'], view: ['clip', 'player'], line: ['top', 'bottom', 'off'] };

let cfg = Object.assign({}, DEFAULTS);
let searcher = defaultSearch;
let say = async () => false;
let onChange = () => {};
let seq = 0;
let useFile = true;
let current = null;          // { uid, id, title, channel, seconds, by, login }
let paused = false;
let queue = [];
let history = [];
const lastAt = new Map();    // login → время последнего заказа

function sanitize(src, base) {
  const out = Object.assign({}, base), b = src || {};
  BOOL.forEach((k) => { if (typeof b[k] === 'boolean') out[k] = b[k]; });
  ['commands', 'skipCommands'].forEach((k) => { if (typeof b[k] === 'string') out[k] = b[k].replace(/[!\r\n]/g, '').slice(0, 80); });
  if (typeof b.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.accent)) out.accent = b.accent.toLowerCase();
  Object.keys(NUM).forEach((k) => { if (b[k] != null && isFinite(Number(b[k]))) out[k] = Math.max(NUM[k][0], Math.min(NUM[k][1], Math.round(Number(b[k])))); });
  Object.keys(ENUM).forEach((k) => { if (ENUM[k].includes(b[k])) out[k] = b[k]; });
  return out;
}
function load() { try { cfg = sanitize(JSON.parse(fs.readFileSync(FILE, 'utf8')), DEFAULTS); } catch (e) { cfg = Object.assign({}, DEFAULTS); } }
function persist() { if (!useFile) return; try { fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2)); } catch (e) { /* не критично */ } }
function init(opts) {
  const o = opts || {};
  if (o.search) searcher = o.search;
  if (o.say) say = o.say;
  if (o.onChange) onChange = o.onChange;
  useFile = !o.noFile;
  if (useFile) load();
}
function reset() { current = null; paused = false; queue = []; history = []; lastAt.clear(); cfg = Object.assign({}, DEFAULTS); }
function getSettings() { return Object.assign({}, cfg); }
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
async function defaultSearch(query) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 10000);
  try {
    const id = videoIdFrom(query);
    if (id) {
      const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal: ctl.signal });
      const j = r.ok ? await r.json() : null;
      return [{ id, title: (j && j.title) || 'Видео YouTube', channel: (j && j.author_name) || '', seconds: 0 }];
    }
    const r = await fetch('https://www.youtube.com/results?hl=ru&gl=RU&search_query=' + encodeURIComponent(query), {
      signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'ru-RU,ru;q=0.9' },
    });
    if (!r.ok) throw new Error('YouTube ответил ' + r.status);
    return parseResults(await r.text());
  } finally { clearTimeout(to); }
}

/* ---------- Очередь ---------- */

function mkItem(hit, by, login) { return { uid: ++seq, id: hit.id, title: hit.title, channel: hit.channel || '', seconds: hit.seconds || 0, by: by || '', login: login || '' }; }
function startNext() {
  if (current) history.unshift(current), history = history.slice(0, 10);
  current = queue.shift() || null;
  paused = false;
  if (current && cfg.autoShow) cfg.showVideo = true;
  onChange();
  return current;
}
function enqueue(item) { queue.push(item); if (!current) startNext(); else onChange(); return item; }
function ended(uid) { if (current && (uid == null || Number(uid) === current.uid)) startNext(); }
function skip() { if (current) startNext(); else onChange(); }
function remove(uid) { const n = queue.length; queue = queue.filter((q) => q.uid !== Number(uid)); if (queue.length !== n) onChange(); }
function clear() { queue = []; onChange(); }
function setPaused(p) { paused = !!p; onChange(); }
function setShow(v) { cfg.showVideo = !!v; persist(); onChange(); return cfg.showVideo; }
function stop() { queue = []; if (current) history.unshift(current), history = history.slice(0, 10); current = null; paused = false; onChange(); }
function state() {
  return { settings: getSettings(), paused, current, queue: queue.slice(), history: history.slice(), ts: Date.now() };
}
const fmt = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');

/** Ручной заказ из админки: текст, ссылка или название. */
async function addByQuery(query, by) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) throw new Error('Введи название или ссылку.');
  const hits = await searcher(q);
  const hit = pickHit(hits);
  if (!hit) throw new Error('Ничего не нашлось.');
  return enqueue(mkItem(hit, by || 'Стример', ''));
}
function pickHit(hits) { return (hits || []).find((h) => h && h.id && (!h.seconds || h.seconds <= cfg.maxMinutes * 60)) || null; }

/* ---------- Чат ---------- */

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
  if (words(cfg.skipCommands).includes(cmd)) {
    if (!(roles.broadcaster || roles.mod)) return true;
    if (!current) return true;
    const t = current.title; skip(); await reply(`⏭ Пропущено: ${t}`); return true;
  }
  if (!words(cfg.commands).includes(cmd)) return false;
  const name = m.name || m.login || '';
  if (!roleOk(roles)) { await reply(`@${name}, заказ музыки сейчас доступен не всем.`); return true; }
  if (!arg) { await reply(`@${name}, напиши !${words(cfg.commands)[0]} и название песни.`); return true; }
  const login = String(m.login || name).toLowerCase();
  const privileged = !!(roles.broadcaster || roles.mod);
  if (!privileged) {
    const wait = Math.ceil(((lastAt.get(login) || 0) + cfg.cooldown * 1000 - Date.now()) / 1000);
    if (wait > 0) { await reply(`@${name}, подожди ещё ${wait} с перед новым заказом.`); return true; }
    if (queue.filter((q) => q.login === login).length >= cfg.perUser) { await reply(`@${name}, у тебя уже ${cfg.perUser} трека в очереди.`); return true; }
  }
  if (queue.length >= cfg.maxQueue) { await reply(`@${name}, очередь заполнена, попробуй позже.`); return true; }
  lastAt.set(login, Date.now());
  let hits;
  try { hits = await searcher(arg); } catch (e) { await reply(`@${name}, не получилось найти трек (YouTube не отвечает).`); return true; }
  const hit = pickHit(hits);
  if (!hit) { await reply(`@${name}, ничего не нашлось по запросу «${arg.slice(0, 60)}» (или клип длиннее ${cfg.maxMinutes} мин).`); return true; }
  const playingNow = !current;
  const item = enqueue(mkItem(hit, name, login));
  await reply(playingNow ? `▶ Играет: ${item.title} (заказ @${name})` : `➕ @${name}, в очереди №${queue.length}: ${item.title}${item.seconds ? ' [' + fmt(item.seconds) + ']' : ''}`);
  return true;
}

module.exports = { DEFAULTS, init, reset, getSettings, update, state, addByQuery, onChat, ended, skip, remove, clear, setPaused, setShow, stop, parseResults, videoIdFrom, parseSeconds };
