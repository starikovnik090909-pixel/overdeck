// shoutouts.js — бот отмечает в чате канал стримера, который зарейдил, и запоминает его.
// Когда запомненный стример потом сам пишет в чате (даже без рейда), бот отмечает его снова — не чаще раза в «паузу».
// Хранится в shoutouts.json (в .gitignore).
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, 'shoutouts.json');
const DEFAULT_TEXT = 'Заходите к {user} — классный стример! twitch.tv/{login}';
const MAX_LIST = 500;

let settings = { enabled: true, onRaid: true, onReturn: true, text: DEFAULT_TEXT, cooldownHours: 12 };
let list = {}; // login -> { login, name, id, raids, lastRaidAt, lastShoutAt }
let say = async () => false;
let native = async () => false;

function clean(login) { return String(login || '').trim().toLowerCase().replace(/^@/, ''); }
function render(text, e) {
  return String(text || DEFAULT_TEXT).replace(/\{user\}/gi, e.name || e.login).replace(/\{login\}/gi, e.login).replace(/\s+/g, ' ').trim().slice(0, 480);
}
function normSettings(s) {
  const o = { ...settings };
  if (s && typeof s === 'object') {
    ['enabled', 'onRaid', 'onReturn'].forEach((k) => { if (s[k] !== undefined) o[k] = !!s[k]; });
    if (typeof s.text === 'string') { const t = s.text.replace(/\s+/g, ' ').trim(); o.text = (t || DEFAULT_TEXT).slice(0, 400); }
    if (s.cooldownHours !== undefined) { const n = Number(s.cooldownHours); o.cooldownHours = Number.isFinite(n) ? Math.min(168, Math.max(1, Math.round(n))) : o.cooldownHours; }
  }
  return o;
}
function load() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
      settings = normSettings(raw && raw.settings);
      list = {};
      (Array.isArray(raw && raw.list) ? raw.list : []).slice(0, MAX_LIST).forEach((x) => {
        const l = clean(x && x.login); if (!l) return;
        list[l] = { login: l, name: String(x.name || l).slice(0, 40), id: String(x.id || ''), raids: Number(x.raids) || 0, lastRaidAt: Number(x.lastRaidAt) || 0, lastShoutAt: Number(x.lastShoutAt) || 0 };
      });
    }
  } catch (e) { console.warn('[Отметки] Не удалось прочитать shoutouts.json:', e.message); }
}
function persist() {
  try {
    fs.writeFileSync(FILE_PATH + '.tmp', JSON.stringify({ settings, list: Object.values(list) }, null, 2));
    fs.renameSync(FILE_PATH + '.tmp', FILE_PATH);
  } catch (e) { console.warn('[Отметки] Не удалось сохранить:', e.message); }
}
function init(deps) { if (deps && deps.say) say = deps.say; if (deps && deps.native) native = deps.native; load(); }

async function shout(e) {
  e.lastShoutAt = Date.now(); persist();
  try { await native(e); } catch (x) { /* официальный /shoutout — по возможности */ }
  return say(render(settings.text, e));
}

/** Пришёл рейд: запоминаем стримера и (если включено) отмечаем его. */
function onRaid(r) {
  const login = clean(r && r.login); if (!login) return;
  if (!list[login] && Object.keys(list).length >= MAX_LIST) {
    const oldest = Object.values(list).sort((a, b) => (a.lastRaidAt || 0) - (b.lastRaidAt || 0))[0]; if (oldest) delete list[oldest.login];
  }
  const e = list[login] || (list[login] = { login, name: login, id: '', raids: 0, lastRaidAt: 0, lastShoutAt: 0 });
  e.name = String(r.name || e.name || login).slice(0, 40); if (r.id) e.id = String(r.id);
  e.raids += 1; e.lastRaidAt = Date.now(); persist();
  if (settings.enabled && settings.onRaid) shout(e).catch(() => {});
}
/** Сообщение в чате: если пишет запомненный стример и пауза прошла — отмечаем. Дешёвая проверка по словарю. */
function onChat(login, ownLogins) {
  if (!settings.enabled || !settings.onReturn) return;
  const l = clean(login); const e = list[l]; if (!e) return;
  if (ownLogins && ownLogins.some((o) => clean(o) === l)) return;
  if (Date.now() - e.lastShoutAt < settings.cooldownHours * 3600000) return;
  e.lastShoutAt = Date.now(); // ставим сразу — чтобы два быстрых сообщения подряд не дали двойную отметку
  shout(e).catch(() => {});
}
function getState() { return { settings: { ...settings }, list: Object.values(list).sort((a, b) => (b.lastRaidAt || 0) - (a.lastRaidAt || 0)), defaultText: DEFAULT_TEXT }; }
function setSettings(s) { settings = normSettings(s); persist(); return getState(); }
function remove(login) { delete list[clean(login)]; persist(); return getState(); }
function add(login) { const l = clean(login); if (!/^[a-z0-9_]{2,25}$/.test(l)) return { ok: false, error: 'Укажи ник канала на Twitch.' }; if (!list[l]) list[l] = { login: l, name: l, id: '', raids: 0, lastRaidAt: 0, lastShoutAt: 0 }; persist(); return { ok: true, ...getState() }; }
function test(login) { const l = clean(login); const e = list[l] || { login: l || 'streamer', name: l || 'streamer' }; return say(render(settings.text, e)); }

module.exports = { init, onRaid, onChat, getState, setSettings, remove, add, test, render, DEFAULT_TEXT };
