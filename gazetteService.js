// gazetteService.js — «Вечерний выпуск»: настройки, что сейчас показано в OBS, сборка выпуска из журнала.
// Страницы OBS (credits.html, gazette.html, onair.html) раз в секунду спрашивают /api/gazette/state и сами решают, что играть.
const fs = require('fs');
const path = require('path');
const Gazette = require('./gazette');
const demo = require('./gazetteDemo');
const journal = require('./streamJournal');

const FILE = path.join(__dirname, 'gazette_settings.json');
const MEM_FILE = path.join(__dirname, 'gazette_memory.json'); // память выпусков: какие фразы уже были и кого помним (только на этом ПК)

const DEFAULTS = {
  studioName: '',          // пусто — берётся имя канала
  journalEnabled: true,    // писать тексты чата в журнал (на этом ПК)
  creditsSpeed: 'normal',  // slow | normal | fast — скорость титров
  creditsHoldSec: 0,       // через сколько секунд после титров убрать экран; 0 — не убирать, пока не нажмёшь «Скрыть»
  ghostChat: true,         // сообщения чата плывут по фону
  wallNames: true,         // «в эпизодах» — все, кто писал
  onair: { bug: false, ticker: true, plate: true, intervalMin: 15, plateSec: 20 },
};

let cfg = JSON.parse(JSON.stringify(DEFAULTS));
let screen = { format: null, rev: 0, demo: null };
let pulse = { rev: 0, demo: null };
let channel = '';
let cache = { key: '', at: 0, val: null };
let mem = { used: {}, nicks: {}, streams: 0, committed: 0 };
let lastPicks = null; // фразы последнего живого выпуска — фиксируются в памяти, когда выпуск показали в OBS

function loadMem() {
  try { const m = JSON.parse(fs.readFileSync(MEM_FILE, 'utf8')); mem = { used: m.used || {}, nicks: m.nicks || {}, streams: m.streams || 0, committed: m.committed || 0 }; } catch (e) { mem = { used: {}, nicks: {}, streams: 0, committed: 0 }; }
}
function saveMem() {
  try { const tmp = MEM_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(mem)); fs.renameSync(tmp, MEM_FILE); } catch (e) { /* память необязательна */ }
}
/** Ники, которых помним между стримами: сколько эфиров были в чате, сколько раз донатили, о чём просили. Хранится только локально. */
function commitSession(S) {
  if (!S || !S.chat || S.chat.length < 20 || S.startTs === mem.committed) return;
  const A = Gazette.analyze(S, {});
  const seen = new Set();
  Object.keys(A.byUser || {}).forEach((u) => {
    const k = u.toLowerCase(); seen.add(k);
    const n = mem.nicks[k] || (mem.nicks[k] = { s: 0, m: 0, d: 0, t: {} });
    n.s += 1; n.m += A.byUser[u]; n.l = S.startTs;
    Object.entries((A.userTopics || {})[u] || {}).forEach(([id, c]) => { n.t[id] = (n.t[id] || 0) + c; });
  });
  S.events.filter((e) => e.type === 'donation' && e.user).forEach((e) => {
    const k = e.user.toLowerCase(); const n = mem.nicks[k] || (mem.nicks[k] = { s: 0, m: 0, d: 0, t: {} }); n.d += 1; n.ds = (n.ds || 0) + (e.amount || 0);
  });
  // не копим бесконечно: оставляем самых активных и тех, кто донатил
  const keys = Object.keys(mem.nicks);
  if (keys.length > 3000) keys.sort((a, b) => (mem.nicks[b].s + mem.nicks[b].d * 3) - (mem.nicks[a].s + mem.nicks[a].d * 3)).slice(2500).forEach((k) => delete mem.nicks[k]);
  mem.streams += 1; mem.committed = S.startTs;
  saveMem();
}
function commitPicks() {
  if (!lastPicks || !lastPicks.length) return;
  lastPicks.forEach(({ key, idx }) => {
    const arr = (mem.used[key] = mem.used[key] || []);
    if (arr.indexOf(idx) < 0) arr.push(idx);
    while (arr.length > 40) arr.shift();
  });
  lastPicks = null; saveMem();
}

function clamp(n, a, b, d) { n = Number(n); return Number.isFinite(n) ? Math.min(b, Math.max(a, Math.round(n))) : d; }

function normalize(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const o = raw.onair && typeof raw.onair === 'object' ? raw.onair : {};
  const d = DEFAULTS;
  return {
    studioName: typeof raw.studioName === 'string' ? raw.studioName.trim().slice(0, 30) : d.studioName,
    journalEnabled: typeof raw.journalEnabled === 'boolean' ? raw.journalEnabled : d.journalEnabled,
    creditsSpeed: ['slow', 'normal', 'fast'].includes(raw.creditsSpeed) ? raw.creditsSpeed : d.creditsSpeed,
    creditsHoldSec: clamp(raw.creditsHoldSec, 0, 600, d.creditsHoldSec),
    ghostChat: typeof raw.ghostChat === 'boolean' ? raw.ghostChat : d.ghostChat,
    wallNames: typeof raw.wallNames === 'boolean' ? raw.wallNames : d.wallNames,
    onair: {
      bug: typeof o.bug === 'boolean' ? o.bug : d.onair.bug,
      ticker: typeof o.ticker === 'boolean' ? o.ticker : d.onair.ticker,
      plate: typeof o.plate === 'boolean' ? o.plate : d.onair.plate,
      intervalMin: clamp(o.intervalMin, 2, 120, d.onair.intervalMin),
      plateSec: clamp(o.plateSec, 8, 90, d.onair.plateSec),
    },
  };
}

function init(opts) {
  channel = (opts && opts.channel) || '';
  try { cfg = normalize(JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) { cfg = normalize({}); }
  journal.init({ enabled: cfg.journalEnabled });
  loadMem();
  const origReset = journal.reset; // перед новым стримом запоминаем зрителей прошлого
  journal.reset = function () { try { commitSession(journal.getSession()); } catch (e) { /* память необязательна */ } return origReset.apply(this, arguments); };
}
function setChannel(c) { channel = c || ''; }

function save() {
  try { const tmp = FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2)); fs.renameSync(tmp, FILE); } catch (e) { /* настройки необязательны для работы */ }
}
function getSettings() { return JSON.parse(JSON.stringify(cfg)); }
function update(patch) {
  const merged = { ...cfg, ...(patch || {}), onair: { ...cfg.onair, ...((patch && patch.onair) || {}) } };
  cfg = normalize(merged);
  journal.setEnabled(cfg.journalEnabled);
  cache = { key: '', at: 0, val: null };
  save();
  return getSettings();
}

function studio() {
  let n = cfg.studioName || channel || 'Стример';
  if (/ВСТАВЬ|YOUR_|CHANNEL/i.test(n)) n = 'Стример'; // в config.example.json стоит заглушка вместо канала
  return n.length ? n[0].toUpperCase() + n.slice(1) : 'Стример';
}

function state() {
  return { screen: { ...screen }, pulse: { ...pulse }, settings: getSettings(), studio: studio() };
}
function show(format, demoId) {
  if (!['credits', 'gazette'].includes(format)) return state();
  screen = { format, rev: screen.rev + 1, demo: demo.ids.includes(demoId) ? demoId : null };
  if (!screen.demo) commitPicks(); // выпуск показан — его фразы больше не повторяем
  return state();
}
function hide() { screen = { format: null, rev: screen.rev + 1, demo: null }; return state(); }
function firePulse(demoId) { pulse = { rev: pulse.rev + 1, demo: demo.ids.includes(demoId) ? demoId : null }; return state(); }

function thin(arr, n) {
  if (arr.length <= n) return arr.slice();
  const step = (arr.length - 1) / (n - 1), out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

/** Выпуск для страниц: из журнала текущего стрима или из тестового вечера demoId (A–D). */
function buildIssue(opts) {
  opts = opts || {};
  const demoId = demo.ids.includes(opts.demo) ? opts.demo : null;
  const seed = clamp(opts.seed, 1, 9999, 1);
  const key = (demoId || 'live') + ':' + seed;
  const now = Date.now();
  if (cache.val && cache.key === key && now - cache.at < (demoId ? 600000 : 4000)) return cache.val;

  let S, roster, art = null, mainGame = '';
  if (demoId) {
    S = demo.make(demoId, 7);
    roster = journalRoster(S);
  } else {
    S = journal.getSession();
    roster = journal.getRoster(S);
    art = journal.gameArt();
  }
  const name = studio();
  S.streamer = name;
  S.tzOffsetMin = demoId ? 0 : -new Date().getTimezoneOffset(); // время в хронике — по часам этого ПК
  // демо-вечера строим без памяти, живой — с памятью прошлых выпусков и зрителей (копия, чтобы опрос раз в секунду ничего не менял)
  const g = Gazette.build(S, { seed, masthead: 'ВЕСТНИК ' + name.toUpperCase(), memory: demoId ? null : JSON.parse(JSON.stringify({ used: mem.used, nicks: mem.nicks })) });
  if (!demoId) lastPicks = g.picks;
  const gamesByTime = (S.games || []).slice().sort((a, b) => a.from - b.from);
  mainGame = g && gamesByTime.length ? (gamesByTime.slice().sort((a, b) => b.from - a.from)[0].name) : '';
  const mg = (S.games || []).length ? longestGame(S) : '';
  const issue = {
    demo: demoId, studio: name, seed,
    startTs: S.startTs, endTs: S.endTs,
    masthead: g.masthead, headline: g.headline, deck: g.deck, lead: g.lead, leadKind: g.leadKind,
    stories: g.stories.map((s) => ({ kind: s.kind, title: s.title })),
    timeline: g.timeline, word: g.word, emote: g.emote, quote: g.quote, heroes: g.heroes, weather: g.weather,
    confidence: g.confidence, facts: g.facts, buckets: thin(g.buckets, 90),
    game: mg || mainGame || '', art: art && (!mg || art.name === mg) ? art.art : '',
    roster,
    ghost: pickGhost(S),
    clockOffsetMin: -new Date().getTimezoneOffset(),
  };
  cache = { key, at: now, val: issue };
  return issue;
}

function longestGame(S) {
  const gs = (S.games || []).slice().sort((a, b) => a.from - b.from);
  let best = '', bd = -1;
  gs.forEach((g, i) => { const d = (gs[i + 1] ? gs[i + 1].from : S.endTs) - g.from; if (d > bd) { bd = d; best = g.name; } });
  return best;
}
function journalRoster(S) {
  // тот же расчёт, что у журнала, для тестового вечера
  const cnt = {};
  S.chat.forEach((m) => { cnt[m.user] = (cnt[m.user] || 0) + 1; });
  const chatters = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([user, n]) => ({ user, n }));
  const don = {};
  S.events.filter((e) => e.type === 'donation').forEach((e) => { don[e.user] = (don[e.user] || 0) + e.amount; });
  const uniq = (t) => [...new Set(S.events.filter((e) => e.type === t).map((e) => e.user))];
  return {
    chatters: chatters.slice(0, 150), totalChatters: chatters.length,
    donors: Object.entries(don).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([user, sum]) => ({ user, sum })),
    subs: [...new Set(S.events.filter((e) => e.type === 'sub' || e.type === 'giftsub').map((e) => e.user))],
    follows: uniq('follow'),
    raiders: S.events.filter((e) => e.type === 'raid').map((e) => ({ user: e.user, viewers: e.viewers })),
  };
}
/** Короткие живые реплики чата для «призраков» на фоне: берём разные ники, без ссылок и команд. */
function pickGhost(S) {
  const out = [], seen = new Set();
  const msgs = S.chat.filter((m) => m.text.length >= 3 && m.text.length <= 48 && !/(https?:|www\.|\.ru\b|\.com\b)/i.test(m.text));
  const step = Math.max(1, Math.floor(msgs.length / 60));
  for (let i = 0; i < msgs.length && out.length < 40; i += step) {
    const m = msgs[i]; const k = m.text.toLowerCase();
    if (seen.has(k)) continue; seen.add(k); out.push({ user: m.user, text: m.text });
  }
  return out;
}

module.exports = { MEM_FILE, commitSession, init, setChannel, getSettings, update, state, show, hide, firePulse, buildIssue, journal, demo, DEFAULTS, normalize };
