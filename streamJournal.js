// streamJournal.js — журнал текущего стрима для «Вечернего выпуска» (вкладка «Доп. функционал»).
// Хранит тексты сообщений чата, события (фоллоу, подписки, рейды, донаты), число зрителей и смену игр.
// Файл stream_journal.json лежит только на этом ПК (в .gitignore и не входит в файл авторизации).
// Из журнала gazette.js собирает выпуск; сам журнал никуда не отправляется.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'stream_journal.json');
const MAX_CHAT = 20000;
const MAX_EVENTS = 5000;
const MAX_VIEWERS = 1500;
const MAX_TEXT = 200;

let enabled = true; // писать ли тексты чата (события и зрители пишутся всегда)
let data = fresh();
let dirty = false;
let timer = null;

function fresh() { return { startedAt: Date.now(), chat: [], events: [], viewers: [], games: [] }; }

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      data = {
        startedAt: Number(raw.startedAt) || Date.now(),
        chat: Array.isArray(raw.chat) ? raw.chat.slice(-MAX_CHAT) : [],
        events: Array.isArray(raw.events) ? raw.events.slice(-MAX_EVENTS) : [],
        viewers: Array.isArray(raw.viewers) ? raw.viewers.slice(-MAX_VIEWERS) : [],
        games: Array.isArray(raw.games) ? raw.games.slice(-60) : [],
      };
    }
  } catch (e) { /* первого файла может не быть */ }
  const lastTs = Math.max(0, ...data.chat.slice(-1).map((x) => x.ts), ...data.events.slice(-1).map((x) => x.ts), ...data.viewers.slice(-1).map((x) => x.ts));
  if (lastTs && Date.now() - lastTs > 12 * 3600000) data = fresh(); // журнал прошлого стрима, запись которого давно закончилась, не тянем в новый
}

function save() {
  if (!dirty) return;
  dirty = false;
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, FILE);
  } catch (e) { dirty = true; }
}

function init(opts) {
  enabled = !opts || opts.enabled !== false;
  load();
  clearInterval(timer);
  timer = setInterval(save, 20000);
  if (timer.unref) timer.unref();
  process.on('exit', save);
}

function setEnabled(v) { enabled = !!v; }

function noteChat(user, text) {
  if (!enabled || !user) return;
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  if (!text || /^[!/]/.test(text)) return; // команды бота — не разговор
  data.chat.push({ ts: Date.now(), user: String(user).slice(0, 40), text });
  if (data.chat.length > MAX_CHAT) data.chat.splice(0, data.chat.length - MAX_CHAT);
  dirty = true;
}

/** evt — событие из handleTimelineWeightedEvent (type/username/meta) или { type:'follow', username }. */
function noteEvent(evt) {
  if (!evt || !evt.type) return;
  const m = evt.meta || {};
  const user = evt.username || evt.user || '';
  let e = null;
  switch (evt.type) {
    case 'follow': e = { type: 'follow', user }; break;
    case 'sub': e = { type: 'sub', user, tier: Math.max(1, Math.round((parseInt(m.tier, 10) || 1000) / 1000)) }; break;
    case 'giftsub': e = { type: 'giftsub', user, count: Math.max(1, parseInt(m.total, 10) || 1) }; break;
    case 'raid': e = { type: 'raid', user, viewers: Math.max(0, parseInt(m.viewers, 10) || 0) }; break;
    case 'donation': e = { type: 'donation', user, amount: Math.round(Number(m.amountRub != null ? m.amountRub : m.amount) || 0), text: String(m.message || '').slice(0, 160) }; break;
    default: return;
  }
  if (e.type === 'follow') { const now = Date.now(); if (data.events.slice(-30).some((x) => x.type === 'follow' && x.user === e.user && now - x.ts < 120000)) return; } // карточка фоллоу может прийти дважды (после загрузки аватарки)
  data.events.push({ ts: Date.now(), ...e });
  if (data.events.length > MAX_EVENTS) data.events.splice(0, data.events.length - MAX_EVENTS);
  dirty = true;
}

function noteViewers(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n) || n < 0) return;
  data.viewers.push({ ts: Date.now(), n });
  if (data.viewers.length > MAX_VIEWERS) data.viewers.splice(0, data.viewers.length - MAX_VIEWERS);
  dirty = true;
}

function noteGame(name, boxArt) {
  if (!name) return;
  const last = data.games[data.games.length - 1];
  if (last && last.name === name) { if (boxArt && !last.art) { last.art = boxArt; dirty = true; } return; }
  data.games.push({ name: String(name).slice(0, 80), from: Date.now(), art: boxArt || '' });
  dirty = true;
}

function reset() { data = fresh(); dirty = true; save(); }
function clearChat() { data.chat = []; dirty = true; save(); }

function counts() {
  return { chat: data.chat.length, events: data.events.length, viewers: data.viewers.length, startedAt: data.startedAt, minutes: Math.round((Date.now() - data.startedAt) / 60000), enabled };
}

/** Сессия для Gazette.build + «состав» вечера (кто писал, кто донатил, новые лица). */
function getSession() {
  const startTs = data.startedAt;
  const endTs = Date.now();
  const games = data.games.length ? data.games.map((g, i) => ({ name: g.name, from: i === 0 ? Math.min(g.from, startTs) : g.from })) : [];
  return { startTs, endTs, games, events: data.events.slice(), chat: data.chat.slice(), viewers: data.viewers.slice() };
}

function getRoster(session, limit) {
  const S = session || getSession();
  limit = limit || 150;
  const cnt = {};
  S.chat.forEach((m) => { cnt[m.user] = (cnt[m.user] || 0) + 1; });
  const chatters = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([user, n]) => ({ user, n }));
  const don = {};
  S.events.filter((e) => e.type === 'donation' && e.user).forEach((e) => { don[e.user] = (don[e.user] || 0) + (e.amount || 0); });
  const donors = Object.entries(don).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([user, sum]) => ({ user, sum }));
  const uniq = (type) => [...new Set(S.events.filter((e) => e.type === type && e.user).map((e) => e.user))].slice(0, 40);
  const subs = [...new Set(S.events.filter((e) => (e.type === 'sub' || e.type === 'giftsub') && e.user).map((e) => e.user))].slice(0, 40);
  return { chatters, donors, subs, follows: uniq('follow'), raiders: S.events.filter((e) => e.type === 'raid').map((e) => ({ user: e.user, viewers: e.viewers })).slice(0, 5), totalChatters: Object.keys(cnt).length };
}

function gameArt() {
  const g = data.games.slice().reverse().find((x) => x.art);
  return g ? { name: g.name, art: g.art } : null;
}

module.exports = { FILE, init, setEnabled, noteChat, noteEvent, noteViewers, noteGame, reset, clearChat, counts, getSession, getRoster, gameArt, save };
