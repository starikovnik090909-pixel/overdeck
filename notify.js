// notify.js — уведомления Overdeck в углу рабочего стола Windows.
// Любой модуль зовёт notify.emit('obs.refreshed', { count: 4 }); окно-таблетку рисует notify-host.ps1.
// Настройки (что показывать, угол, подробности) лежат в notify_settings.json и меняются в админке.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const FILE = path.join(__dirname, 'notify_settings.json');
const HOST = path.join(__dirname, 'notify-host.ps1');

// level: crit (висит, пока не закроешь) > err > warn > ok > info. Внутри блока показываем по важности.
const LEVELS = { crit: 0, err: 1, warn: 2, ok: 3, info: 4 };
const LEVEL_NAME = { crit: 'Критично', err: 'Ошибки', warn: 'Внимание', ok: 'Успех', info: 'Сведения' };
const KIND = { crit: 'err', err: 'err', warn: 'warn', ok: 'ok', info: 'info' };
const DUR = { crit: 0, err: 9, warn: 6, ok: 3.5, info: 4 };

const GROUPS = [
  { id: 'obs', title: 'OBS' },
  { id: 'twitch', title: 'Twitch' },
  { id: 'donations', title: 'Донаты' },
  { id: 'social', title: 'Telegram и Discord' },
  { id: 'voice', title: 'Озвучка' },
  { id: 'app', title: 'Само приложение' },
];

// id, группа, уровень, заголовок, подпись (можно {поле}), включено по умолчанию
const EVENTS = [
  ['obs.refreshed', 'obs', 'ok', 'Источники OBS обновлены', 'Обновлено: {count}', 1],
  ['obs.unreachable', 'obs', 'err', 'OBS не отвечает', 'Запусти OBS и включи WebSocket-сервер', 1],
  ['obs.auth', 'obs', 'err', 'Неверный пароль OBS', 'Введи пароль заново в настройках автообновления', 1],

  ['twitch.auth', 'twitch', 'crit', 'Вход в Twitch истёк', 'Войди заново, иначе чат и награды остановятся', 1],
  ['twitch.chat_lost', 'twitch', 'warn', 'Twitch переподключается', 'Чат на паузе на несколько секунд', 1],

  ['da.auth', 'donations', 'crit', 'DonationAlerts отключился', 'Токен не принят. Подключи сервис снова', 1],
  ['da.disconnect', 'donations', 'warn', 'DonationAlerts потерял связь', 'Подключаемся заново', 1],
  ['dp.fail', 'donations', 'err', 'DonatePay не отвечает', 'Повторим сами, пока не вернётся', 1],

  ['tg.sent', 'social', 'ok', 'Анонс в Telegram отправлен', 'Пост опубликован в канале', 1],
  ['tg.fail', 'social', 'err', 'Анонс в Telegram не доставлен', '{reason}', 1],
  ['dc.sent', 'social', 'ok', 'Анонс в Discord отправлен', 'Вебхук принял сообщение', 1],
  ['dc.fail', 'social', 'err', 'Анонс в Discord не доставлен', '{reason}', 1],

  ['tts.nopiper', 'voice', 'err', 'Озвучка не запустилась', 'Не найден движок Piper', 1],

  ['self.problem', 'app', 'err', 'Overdeck нашёл проблему', '{reason}', 1],
  ['backup.done', 'app', 'ok', 'Резервная копия создана', '{name}', 0],
  ['backup.fail', 'app', 'err', 'Резервная копия не получилась', '{reason}', 1],
  ['test', 'app', 'info', 'Проверка уведомлений', 'Так выглядят уведомления Overdeck', 1],
].map(([id, group, level, title, text, on]) => ({ id, group, level, title, text, on: !!on }));
const BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

// Подписи для окна настроек там, где в самой плашке подставляется текст
const HINTS = {
  'obs.refreshed': 'Сколько источников обновлено',
  'tg.fail': 'Причина: бот не в канале, неверный токен, нет связи',
  'dc.fail': 'Причина: вебхук удалён или недействителен',
  'self.problem': 'Что не так и как это исправить',
  'backup.done': 'Имя файла копии',
  'backup.fail': 'Причина сбоя',
};

const DEFAULTS = { enabled: true, details: true, onlyErrors: false, corner: 'br', events: {} };
let cfg = JSON.parse(JSON.stringify(DEFAULTS));
let history = [];
let seq = 0;
const lastShown = new Map(); // id → { at, text }
let host = null;
let hostFails = 0;
let hostState = 'idle'; // idle | running | failed | unsupported
let hostError = '';

function sanitize(b, base) {
  const o = JSON.parse(JSON.stringify(base)); const s = b || {};
  if (typeof s.enabled === 'boolean') o.enabled = s.enabled;
  if (typeof s.details === 'boolean') o.details = s.details;
  if (typeof s.onlyErrors === 'boolean') o.onlyErrors = s.onlyErrors;
  if (['br', 'bl', 'tr', 'tl'].includes(s.corner)) o.corner = s.corner;
  if (s.events && typeof s.events === 'object') Object.keys(s.events).forEach((k) => { if (BY_ID.has(k) && typeof s.events[k] === 'boolean') o.events[k] = s.events[k]; });
  return o;
}
function load() { try { cfg = sanitize(JSON.parse(fs.readFileSync(FILE, 'utf8')), DEFAULTS); } catch (e) { cfg = JSON.parse(JSON.stringify(DEFAULTS)); } }
function save() { try { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(cfg, null, 2)); fs.renameSync(t, FILE); } catch (e) { console.warn('[Уведомления] не удалось сохранить:', e.message); } }

const isOn = (ev) => (ev.id in cfg.events ? cfg.events[ev.id] : ev.on);
const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : '')).trim();
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function startHost() {
  if (host || hostState === 'failed' || hostState === 'unsupported') return host;
  if (process.platform !== 'win32') { hostState = 'unsupported'; return null; }
  if (!fs.existsSync(HOST)) { hostState = 'failed'; return null; }
  try {
    host = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', HOST],
      { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
  } catch (e) { hostState = 'failed'; return null; }
  hostState = 'running';
  let err = '';
  host.stderr.on('data', (d) => { err += d.toString(); if (err.length > 2000) err = err.slice(-2000); });
  host.stdin.on('error', () => { /* окно закрылось */ });
  host.on('error', () => { host = null; hostState = 'failed'; });
  host.on('exit', () => {
    host = null;
    if (hostState === 'running') {
      if (++hostFails >= 3) { hostState = 'failed'; hostError = err.trim().split('\n')[0] || 'неизвестная ошибка'; console.warn('[Уведомления] окно уведомлений не запускается:', hostError); }
      else hostState = 'idle';
    }
  });
  return host;
}
function toHost(msg) {
  const h = startHost(); if (!h) return false;
  try { h.stdin.write(JSON.stringify(msg) + '\n'); return true; } catch (e) { return false; }
}

/** Показать уведомление по id события. opts.silent — записать в журнал, но не показывать. */
function emit(id, vars, opts) { try { return emitInner(id, vars, opts); } catch (e) { return false; } }
function emitInner(id, vars, opts) {
  const ev = BY_ID.get(id); if (!ev) return false;
  const title = clip(fill(ev.title, vars), 80);
  const text = clip(fill(ev.text, vars), 110);
  const item = { n: ++seq, id, group: ev.group, level: ev.level, title, text, at: Date.now(), shown: false };
  history.unshift(item); if (history.length > 50) history.pop();
  if (!cfg.enabled || !isOn(ev) || (opts && opts.silent)) return false;
  if (cfg.onlyErrors && LEVELS[ev.level] > LEVELS.warn) return false;
  const prev = lastShown.get(id);
  const gap = LEVELS[ev.level] <= LEVELS.err ? 120000 : 3000; // одинаковые ошибки не повторяем чаще раза в две минуты
  if (prev && prev.text === text && Date.now() - prev.at < gap) return false;
  lastShown.set(id, { at: Date.now(), text });
  item.shown = toHost({ kind: KIND[ev.level], title, text: cfg.details ? text : '', dur: DUR[ev.level], corner: cfg.corner, keep: ev.level === 'crit' });
  return item.shown;
}

/** Пример из трёх плашек подряд, мимо настроек событий (но с учётом общего выключателя). */
function demo() {
  const items = [['ok', 'Источники OBS обновлены', 'Обновлено: 4'], ['warn', 'Twitch переподключается', 'Чат на паузе на несколько секунд'], ['err', 'Анонс в Telegram не доставлен', 'Бот не добавлен в канал']];
  let n = 0;
  items.forEach(([kind, title, text], i) => setTimeout(() => { if (toHost({ kind, title, text: cfg.details ? text : '', dur: DUR[kind === 'err' ? 'err' : kind], corner: cfg.corner, keep: false })) n++; }, i * 600));
  return items.length;
}

function catalog() {
  return GROUPS.map((g) => ({
    id: g.id, title: g.title,
    events: EVENTS.filter((e) => e.group === g.id).sort((a, b) => LEVELS[a.level] - LEVELS[b.level])
      .map((e) => ({ id: e.id, level: e.level, levelName: LEVEL_NAME[e.level], title: e.title, text: HINTS[e.id] || e.text, on: isOn(e) })),
  })).filter((g) => g.events.length);
}
function state() {
  return { settings: { enabled: cfg.enabled, details: cfg.details, onlyErrors: cfg.onlyErrors, corner: cfg.corner },
    groups: catalog(), history: history.slice(0, 15), host: hostState, hostError, windows: process.platform === 'win32' };
}
function update(b) { cfg = sanitize(b, cfg); save(); return state(); }
function init() { load(); }
function stop() { if (host) { try { host.stdin.end(); } catch (e) { /* уже закрыт */ } host = null; } }

module.exports = { init, emit, demo, state, update, stop, EVENTS, GROUPS, _reset: () => { history = []; lastShown.clear(); } };
